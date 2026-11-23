import { Prisma } from "@prisma/client";
import { isTrainingReminderEmail, type TrainingReminderMessage } from "./notification-delivery-provider";
import { trainingReminderCandidates } from "./notification-queue";

/** Resolve the message for an in-flight claim using the current tenant employee-account link. */
export async function resolveTrainingReminderMessage(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: { organizationId: string; deliveryId: string; attemptCount: number },
): Promise<TrainingReminderMessage | null> {
  const { organizationId, deliveryId, attemptCount } = input;
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) return null;

  const rows = await db.$queryRaw<Array<{ recipientEmail: string; dueDate: string }>>(Prisma.sql`
    ${trainingReminderCandidates(organizationId)}
    SELECT u."email" AS "recipientEmail", to_char(c."dueDate", 'YYYY-MM-DD') AS "dueDate"
    FROM "TrainingRenewalNotificationDelivery" d
    JOIN candidate c
      ON c."employeeId" = d."employeeId" AND c."courseId" = d."courseId"
      AND c."completionId" = d."completionId" AND c."dueDate" = d."renewalDueDate"
      AND c."reminderType" = d."reminderType"
    JOIN "TrainingNotificationSchedule" s ON s."organizationId" = d."organizationId" AND s."enabled"
    JOIN "TrainingEmployeeUserLink" l ON l."organizationId" = d."organizationId" AND l."employeeId" = d."employeeId"
    JOIN "User" u ON u."organizationId" = l."organizationId" AND u."id" = l."userId"
    WHERE d."organizationId" = ${organizationId}::uuid AND d."id" = ${deliveryId}::uuid
      AND d."status" = 'SENDING' AND d."attemptCount" = ${attemptCount}
      AND u."status"::text = 'ACTIVE'
    LIMIT 2
  `);
  if (rows.length !== 1) return null;

  const recipientEmail = rows[0].recipientEmail.trim();
  if (!isTrainingReminderEmail(recipientEmail)) return null;

  return {
    deliveryId,
    organizationId,
    recipientEmail,
    subject: "Trace QMS training renewal reminder",
    text: `A training renewal is due on ${rows[0].dueDate}. Sign in to Trace QMS to review your training.`,
    idempotencyKey: `training-reminder:${deliveryId}`,
  };
}
