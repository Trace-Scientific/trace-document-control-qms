import { Prisma } from "@prisma/client";

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
): Promise<Claim[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("Invalid notification batch size");
  }
  return tx.$queryRaw<Claim[]>(Prisma.sql`
    WITH eligible AS (
      SELECT d."id"
      FROM "TrainingRenewalNotificationDelivery" d
      JOIN "TrainingNotificationPreference" p
        ON p."organizationId" = d."organizationId" AND p."enabled" = TRUE
      WHERE d."organizationId" = ${organizationId}::uuid
        AND (d."status" = 'PENDING'
          OR (d."status" = 'FAILED' AND d."attemptCount" < 3
            AND d."updatedAt" < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))
        AND d."attemptCount" < 3
        AND ((d."reminderType" = 'DUE_30' AND p."remind30Days")
          OR (d."reminderType" = 'DUE_7' AND p."remind7Days")
          OR (d."reminderType" = 'OVERDUE' AND p."remindOverdue"))
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
}

export async function recordTrainingRenewalDeliveryOutcome(
  tx: Transaction,
  input: {
    organizationId: string;
    deliveryId: string;
    attemptCount: number;
    outcome: "SENT" | "FAILED";
    error?: string;
  },
): Promise<boolean> {
  if (!Number.isInteger(input.attemptCount) || input.attemptCount < 1) {
    throw new Error("Invalid attempt number");
  }
  const result = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "TrainingRenewalNotificationDelivery"
    SET "status" = ${input.outcome},
      "sentAt" = CASE WHEN ${input.outcome} = 'SENT' THEN CURRENT_TIMESTAMP ELSE NULL END,
      "lastError" = CASE WHEN ${input.outcome} = 'FAILED' THEN ${(input.error ?? "Delivery failed").slice(0, 500)} ELSE NULL END,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "organizationId" = ${input.organizationId}::uuid
      AND "id" = ${input.deliveryId}::uuid
      AND "status" = 'SENDING' AND "attemptCount" = ${input.attemptCount}
    RETURNING "id"
  `);
  return result.length === 1;
}
