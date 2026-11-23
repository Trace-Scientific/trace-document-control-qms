import { Prisma } from "@prisma/client";

type Transaction = Prisma.TransactionClient;
type Run = { id: string; reservedAt: Date };

// The reservation and readiness report use the same UTC schedule window.
export const trainingReminderStagingWindow = Prisma.sql`
  CROSS JOIN LATERAL (
    SELECT GREATEST(
      CURRENT_TIMESTAMP,
      s."lastRunAt" + s."minimumIntervalHours" * INTERVAL '1 hour'
    ) AT TIME ZONE 'UTC' AS "earliestUtc"
  ) earliest
  CROSS JOIN LATERAL (
    SELECT (
      GREATEST(earliest."earliestUtc",
        date_trunc('day', earliest."earliestUtc") + s."hourUtc" * INTERVAL '1 hour'
      ) AT TIME ZONE 'UTC'
    ) AS "availableAt"
  ) staging_window
`;

/**
 * Internal-only reservation: caller must provide an authenticated tenant actor.
 * Call through an authorized staging or delivery service.
 * Use within a short database transaction, not across outbound network calls.
 */
export async function reserveTrainingNotificationScheduleRun(
  tx: Transaction,
  organizationId: string,
  actorUserId: string,
): Promise<Run | null> {
  // Lock schedule row to serialize concurrent reservations for this tenant.
  const schedule = await tx.$queryRaw<Array<{ enabled: boolean; due: boolean }>>(Prisma.sql`
    SELECT s."enabled",
      (s."enabled" AND p."enabled" AND staging_window."availableAt" <= CURRENT_TIMESTAMP) AS "due"
    FROM "TrainingNotificationSchedule" s
    JOIN "TrainingNotificationPreference" p ON p."organizationId" = s."organizationId"
    ${trainingReminderStagingWindow}
    WHERE s."organizationId" = ${organizationId}::uuid
    FOR UPDATE OF s
  `);
  if (!schedule[0]?.due) return null;
  const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "TrainingNotificationScheduleRun"
    WHERE "organizationId" = ${organizationId}::uuid AND "status" = 'RESERVED'
    LIMIT 1
  `);
  if (existing.length) return null;
  const runs = await tx.$queryRaw<Run[]>(Prisma.sql`
    INSERT INTO "TrainingNotificationScheduleRun" ("organizationId", "actorUserId")
    VALUES (${organizationId}::uuid, ${actorUserId}::uuid)
    RETURNING "id", "reservedAt"
  `);
  const run = runs[0];
  await tx.$executeRaw(Prisma.sql`
    UPDATE "TrainingNotificationSchedule"
    SET "lastRunAt" = ${run.reservedAt}
    WHERE "organizationId" = ${organizationId}::uuid
  `);
  await tx.auditEvent.create({ data: {
    organizationId, actorUserId, action: "TRAINING_NOTIFICATION_SCHEDULE_RESERVED",
    entityType: "TrainingNotificationScheduleRun", entityId: run.id,
    metadata: { deliveryActive: false },
  } });
  return run;
}

/**
 * Close an execution reservation without asserting delivery. An interrupted
 * run should be REVIEW_REQUIRED, never silently retried.
 */
export async function closeTrainingNotificationScheduleRun(
  tx: Transaction,
  input: {
    organizationId: string;
    actorUserId: string;
    runId: string;
    status: "FINISHED" | "REVIEW_REQUIRED";
    claimedCount: number;
    stagedCount?: number;
  },
): Promise<boolean> {
  if (!Number.isInteger(input.claimedCount) || input.claimedCount < 0) {
    throw new Error("Invalid claimed count");
  }
  if (input.stagedCount !== undefined && (!Number.isInteger(input.stagedCount) || input.stagedCount < 0)) {
    throw new Error("Invalid staged count");
  }
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "TrainingNotificationScheduleRun"
    SET "status" = ${input.status}, "claimedCount" = ${input.claimedCount},
      "finishedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.runId}::uuid
      AND "organizationId" = ${input.organizationId}::uuid
      AND "status" = 'RESERVED'
    RETURNING "id"
  `);
  if (!rows.length) return false;
  await tx.auditEvent.create({ data: {
    organizationId: input.organizationId, actorUserId: input.actorUserId,
    action: "TRAINING_NOTIFICATION_SCHEDULE_CLOSED",
    entityType: "TrainingNotificationScheduleRun", entityId: input.runId,
    metadata: {
      status: input.status,
      claimedCount: input.claimedCount,
      ...(input.stagedCount !== undefined ? { stagedCount: input.stagedCount } : {}),
      deliveryActive: false,
    },
  } });
  return true;
}
