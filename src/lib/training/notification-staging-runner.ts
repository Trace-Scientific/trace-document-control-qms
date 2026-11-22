import type { PrismaClient } from "@prisma/client";
import { requireAuthorization, type AuthorizationContext } from "../security/authorization";
import { stageTrainingReminderQueue } from "./notification-queue";
import {
  closeTrainingNotificationScheduleRun,
  reserveTrainingNotificationScheduleRun,
} from "./notification-schedule-runs";

/** Complete one staging-only run for an authenticated training manager. */
export async function runTrainingReminderStaging(
  db: Pick<PrismaClient, "$transaction">,
  context: AuthorizationContext,
  batchSize?: number,
): Promise<{ runId: string; stagedCount: number } | null> {
  const { organizationId, userId: actorUserId } = context;
  requireAuthorization(context, { organizationId, permission: "training.manage" });

  return db.$transaction(async (tx) => {
    const run = await reserveTrainingNotificationScheduleRun(tx, organizationId, actorUserId);
    if (!run) return null;

    const stagedCount = await stageTrainingReminderQueue(tx, { organizationId, runId: run.id, batchSize });
    const closed = await closeTrainingNotificationScheduleRun(tx, {
      organizationId,
      actorUserId,
      runId: run.id,
      status: "FINISHED",
      claimedCount: 0,
      stagedCount,
    });
    if (!closed) throw new Error("Training reminder staging reservation could not be closed");

    return { runId: run.id, stagedCount };
  });
}
