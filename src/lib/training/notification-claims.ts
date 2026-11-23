import { Prisma } from "@prisma/client";
import { trainingReminderCandidates } from "./notification-queue";
import { classifyTrainingReminderOutcome } from "./notification-delivery-outcome";
import { trainingReminderProviderReceipt, type TrainingReminderDeliveryResult } from "./notification-delivery-provider";

/**
 * Internal-only transaction primitives for a future notification worker.
 * Not connected to a route, cron job or mail provider. Do not mark SENT
 * until the external delivery provider has acknowledged the message.
 */
type Transaction = Prisma.TransactionClient;
type Claim = { id: string; organizationId: string; attemptCount: number; reminderType: string };

export async function claimTrainingRenewalNotifications(
  tx: Transaction,
  organizationId: string,
  batchSize = 25,
  actorUserId?: string,
): Promise<Claim[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("Invalid notification batch size");
  }
  const claims = await tx.$queryRaw<Claim[]>(Prisma.sql`
    ${trainingReminderCandidates(organizationId)}, eligible AS (
      SELECT d."id"
      FROM "TrainingRenewalNotificationDelivery" d
      JOIN candidate c
        ON c."employeeId" = d."employeeId" AND c."courseId" = d."courseId"
        AND c."completionId" = d."completionId" AND c."dueDate" = d."renewalDueDate"
        AND c."reminderType" = d."reminderType"
      JOIN "TrainingNotificationSchedule" s ON s."organizationId" = d."organizationId" AND s."enabled"
      WHERE d."organizationId" = ${organizationId}::uuid
        AND (d."status" = 'PENDING'
          OR (d."status" = 'FAILED' AND d."attemptCount" < 3
            AND d."updatedAt" < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))
        AND d."attemptCount" < 3
      ORDER BY d."createdAt", d."id"
      LIMIT ${batchSize}
      FOR UPDATE OF d SKIP LOCKED
    )
    UPDATE "TrainingRenewalNotificationDelivery" d
    SET "status" = 'SENDING', "attemptCount" = d."attemptCount" + 1,
      "lastAttemptAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP,
      "lastError" = NULL
    FROM eligible
    WHERE d."id" = eligible."id" AND d."organizationId" = ${organizationId}::uuid
    RETURNING d."id", d."organizationId", d."attemptCount", d."reminderType"
  `);
  if (claims.length && !actorUserId) throw new Error("Notification claim audit actor required");
  for (const claim of claims) {
    await tx.auditEvent.create({ data: {
      organizationId, actorUserId: actorUserId!, action: "TRAINING_NOTIFICATION_CLAIMED",
      entityType: "TrainingRenewalNotificationDelivery", entityId: claim.id,
      metadata: { attemptCount: claim.attemptCount, reminderType: claim.reminderType },
    } });
  }
  return claims;
}

const deliveryOutcomeAuditActions = {
  SENT: "TRAINING_NOTIFICATION_SENT",
  FAILED: "TRAINING_NOTIFICATION_FAILED",
  REVIEW_REQUIRED: "TRAINING_NOTIFICATION_REVIEW_REQUIRED",
} as const;

export async function recordTrainingRenewalDeliveryOutcome(
  tx: Transaction,
  input: {
    organizationId: string;
    deliveryId: string;
    attemptCount: number;
    outcome: keyof typeof deliveryOutcomeAuditActions;
    error?: string;
    providerMessageId?: string;
    actorUserId: string;
  },
): Promise<boolean> {
  if (!Number.isInteger(input.attemptCount) || input.attemptCount < 1) {
    throw new Error("Invalid attempt number");
  }
  const providerMessageId = input.outcome === "SENT" && input.providerMessageId !== undefined
    ? trainingReminderProviderReceipt({ status: "accepted", providerMessageId: input.providerMessageId })
    : null;
  if (input.providerMessageId !== undefined && providerMessageId === null) {
    throw new Error("Invalid provider receipt for notification outcome");
  }
  let lastError: string | null = null;
  switch (input.outcome) {
    case "FAILED":
      lastError = (input.error ?? "Delivery failed").slice(0, 500);
      break;
    case "REVIEW_REQUIRED":
      // Provider exception details may contain recipient information.
      lastError = "Provider delivery could not be confirmed";
      break;
  }
  const result = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "TrainingRenewalNotificationDelivery"
    SET "status" = ${input.outcome},
      "sentAt" = CASE WHEN ${input.outcome} = 'SENT' THEN CURRENT_TIMESTAMP ELSE NULL END,
      "lastError" = ${lastError},
      "providerMessageId" = ${providerMessageId},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "organizationId" = ${input.organizationId}::uuid
      AND "id" = ${input.deliveryId}::uuid
      AND "status" = 'SENDING' AND "attemptCount" = ${input.attemptCount}
    RETURNING "id"
  `);
  if (result.length === 1) {
    await tx.auditEvent.create({ data: {
      organizationId: input.organizationId, actorUserId: input.actorUserId,
      action: deliveryOutcomeAuditActions[input.outcome],
      entityType: "TrainingRenewalNotificationDelivery", entityId: input.deliveryId,
      metadata: {
        attemptCount: input.attemptCount,
        errorRecorded: input.outcome === "REVIEW_REQUIRED" || Boolean(input.error),
        ...(providerMessageId !== null ? { providerReceiptRecorded: true } : {}),
        ...(input.outcome === "REVIEW_REQUIRED" ? { reason: "provider_delivery_unknown" } : {}),
      },
    } });
  }
  return result.length === 1;
}

/** Record the provider result for the exact claimed attempt without retaining provider diagnostics. */
export function recordTrainingRenewalProviderResult(
  tx: Transaction,
  input: {
    organizationId: string;
    deliveryId: string;
    attemptCount: number;
    actorUserId: string;
    result: TrainingReminderDeliveryResult;
  },
): Promise<boolean> {
  const { result, ...attempt } = input;
  return recordTrainingRenewalDeliveryOutcome(tx, {
    ...attempt,
    outcome: classifyTrainingReminderOutcome(result),
    providerMessageId: trainingReminderProviderReceipt(result) ?? undefined,
  });
}

/**
 * Mark abandoned in-flight attempts for manual reconciliation. A crashed worker
 * may have delivered the message before losing its acknowledgement. Never retry
 * such attempts automatically.
 */
export async function quarantineStaleTrainingRenewalClaims(
  tx: Transaction,
  organizationId: string,
  actorUserId: string,
  olderThanMinutes = 60,
): Promise<number> {
  if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 15 || olderThanMinutes > 10080) {
    throw new Error("Invalid recovery age");
  }
  const rows = await tx.$queryRaw<Array<{ id: string; attemptCount: number }>>(Prisma.sql`
    WITH stale AS (
      SELECT "id"
      FROM "TrainingRenewalNotificationDelivery"
      WHERE "organizationId" = ${organizationId}::uuid AND "status" = 'SENDING'
        AND "lastAttemptAt" < CURRENT_TIMESTAMP - (${olderThanMinutes} * INTERVAL '1 minute')
      ORDER BY "lastAttemptAt", "id"
      LIMIT 25
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "TrainingRenewalNotificationDelivery" d
    SET "status" = 'REVIEW_REQUIRED',
      "lastError" = 'Delivery outcome unknown after interrupted processing',
      "updatedAt" = CURRENT_TIMESTAMP
    FROM stale
    WHERE d."id" = stale."id" AND d."organizationId" = ${organizationId}::uuid
    RETURNING d."id", d."attemptCount"
  `);
  for (const row of rows) {
    await tx.auditEvent.create({ data: {
      organizationId, actorUserId, action: "TRAINING_NOTIFICATION_REVIEW_REQUIRED",
      entityType: "TrainingRenewalNotificationDelivery", entityId: row.id,
      metadata: { attemptCount: row.attemptCount, reason: "interrupted_delivery_unknown" },
    } });
  }
  return rows.length;
}
