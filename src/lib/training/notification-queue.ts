import { Prisma } from "@prisma/client";

type QueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

function reminderCandidates(organizationId: string) {
  return Prisma.sql`
    WITH latest AS (
      SELECT DISTINCT ON (r."employeeId", r."courseId")
        r."id" AS "completionId", r."employeeId", r."courseId", r."completedAt"
      FROM "TrainingRecord" r
      WHERE r."organizationId" = ${organizationId}::uuid
      ORDER BY r."employeeId", r."courseId", r."completedAt" DESC, r."createdAt" DESC, r."id" DESC
    ), candidate AS (
      SELECT l."employeeId", l."courseId", l."completionId",
        (l."completedAt" + make_interval(months => p."intervalMonths"))::date AS "dueDate",
        CASE
          WHEN (l."completedAt" + make_interval(months => p."intervalMonths"))::date < CURRENT_DATE
            AND p2."remindOverdue" THEN 'OVERDUE'
          WHEN (l."completedAt" + make_interval(months => p."intervalMonths"))::date
            BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND p2."remind7Days" THEN 'DUE_7'
          WHEN (l."completedAt" + make_interval(months => p."intervalMonths"))::date
            BETWEEN CURRENT_DATE + 8 AND CURRENT_DATE + 30 AND p2."remind30Days" THEN 'DUE_30'
          ELSE NULL
        END AS "reminderType"
      FROM latest l
      JOIN "TrainingCourseRenewalPolicy" p
        ON p."organizationId" = ${organizationId}::uuid AND p."courseId" = l."courseId"
      JOIN "Employee" e
        ON e."organizationId" = ${organizationId}::uuid AND e."id" = l."employeeId"
      JOIN "TrainingNotificationPreference" p2
        ON p2."organizationId" = ${organizationId}::uuid AND p2."enabled" = TRUE
      WHERE e."status"::text = 'ACTIVE'
    )
  `;
}

function matchingLedgerEntry(organizationId: string) {
  return Prisma.sql`
    LEFT JOIN "TrainingRenewalNotificationDelivery" d
      ON d."organizationId" = ${organizationId}::uuid
      AND d."employeeId" = c."employeeId" AND d."courseId" = c."courseId"
      AND d."renewalDueDate" = c."dueDate" AND d."reminderType" = c."reminderType"
  `;
}

export function previewTrainingReminderQueue(client: QueryClient, organizationId: string) {
  return client.$queryRaw<Array<{
    reminderType: string;
    eligible: bigint;
    alreadyRecorded: bigint;
  }>>(Prisma.sql`
    ${reminderCandidates(organizationId)}
    SELECT c."reminderType", count(*) FILTER (WHERE d."id" IS NULL) AS eligible,
      count(*) FILTER (WHERE d."id" IS NOT NULL) AS "alreadyRecorded"
    FROM candidate c
    ${matchingLedgerEntry(organizationId)}
    WHERE c."reminderType" IS NOT NULL
    GROUP BY c."reminderType"
    ORDER BY c."reminderType"
  `);
}

/** Stage a bounded batch inside the caller's transaction for an active schedule reservation. */
export async function stageTrainingReminderQueue(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; runId: string; batchSize?: number },
): Promise<number> {
  const { organizationId, runId, batchSize = 25 } = input;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("Invalid notification batch size");
  }

  const staged = await tx.$queryRaw<Array<{ id: string; reminderType: string; actorUserId: string }>>(Prisma.sql`
    ${reminderCandidates(organizationId)}, active_run AS (
      SELECT r."actorUserId"
      FROM "TrainingNotificationScheduleRun" r
      JOIN "TrainingNotificationSchedule" s ON s."organizationId" = r."organizationId" AND s."enabled"
      WHERE r."organizationId" = ${organizationId}::uuid AND r."id" = ${runId}::uuid
        AND r."status" = 'RESERVED'
      FOR UPDATE OF r
    ), inserted AS (
      INSERT INTO "TrainingRenewalNotificationDelivery"
        ("organizationId", "employeeId", "courseId", "completionId", "renewalDueDate", "reminderType")
      SELECT ${organizationId}::uuid, c."employeeId", c."courseId", c."completionId", c."dueDate", c."reminderType"
      FROM candidate c
      ${matchingLedgerEntry(organizationId)}
      CROSS JOIN active_run
      WHERE c."reminderType" IS NOT NULL AND d."id" IS NULL
      ORDER BY c."dueDate", c."employeeId", c."courseId"
      LIMIT ${batchSize}
      ON CONFLICT ("organizationId", "employeeId", "courseId", "renewalDueDate", "reminderType") DO NOTHING
      RETURNING "id", "reminderType"
    )
    SELECT inserted."id", inserted."reminderType", active_run."actorUserId"
    FROM inserted CROSS JOIN active_run
  `);
  if (staged.length > 0) {
    await tx.auditEvent.createMany({
      data: staged.map(({ id, reminderType, actorUserId }) => ({
        organizationId,
        actorUserId,
        action: "TRAINING_NOTIFICATION_STAGED",
        entityType: "TrainingRenewalNotificationDelivery",
        entityId: id,
        metadata: { reminderType, runId },
      })),
    });
  }
  return staged.length;
}
