import type { PrismaClient } from "@prisma/client";
import { requireAuthorization, type AuthorizationContext } from "../security/authorization";
import {
  claimTrainingRenewalNotifications,
  recordTrainingRenewalDeliveryOutcome,
  recordTrainingRenewalProviderResult,
} from "./notification-claims";
import { classifyTrainingReminderOutcome } from "./notification-delivery-outcome";
import {
  assertTrainingReminderDeliveryAuthorized,
  deliverTrainingReminder,
  type DeliveryAuthorization,
  type TrainingReminderProvider,
} from "./notification-delivery-provider";
import { resolveTrainingReminderMessage } from "./notification-recipient";

type DeliveryRun =
  | { status: "no_eligible_reminder" }
  | { status: "recipient_unavailable"; deliveryId: string }
  | { status: "outcome_not_recorded"; deliveryId: string }
  | { status: "outcome_recorded"; deliveryId: string; outcome: ReturnType<typeof classifyTrainingReminderOutcome> };

/** Process one reminder. Provider calls occur after committing the claim and before opening the outcome transaction. */
export async function runTrainingReminderDelivery(
  db: Pick<PrismaClient, "$transaction" | "$queryRaw">,
  context: AuthorizationContext,
  provider: TrainingReminderProvider,
  authorization: DeliveryAuthorization,
): Promise<DeliveryRun> {
  const { organizationId, userId: actorUserId } = context;
  requireAuthorization(context, { organizationId, permission: "training.manage" });
  assertTrainingReminderDeliveryAuthorized(authorization);

  const [claim] = await db.$transaction((tx) => claimTrainingRenewalNotifications(tx, organizationId, 1, actorUserId));
  if (!claim) return { status: "no_eligible_reminder" };

  const attempt = { organizationId, deliveryId: claim.id, attemptCount: claim.attemptCount, actorUserId };
  const message = await resolveTrainingReminderMessage(db, attempt);
  if (!message) {
    const recorded = await db.$transaction((tx) => recordTrainingRenewalDeliveryOutcome(tx, {
      ...attempt,
      outcome: "FAILED",
      error: "Reminder no longer qualifies or no active recipient is available",
    }));
    return { status: recorded ? "recipient_unavailable" : "outcome_not_recorded", deliveryId: claim.id };
  }

  const result = await deliverTrainingReminder(provider, message, authorization);
  const recorded = await db.$transaction((tx) => recordTrainingRenewalProviderResult(tx, { ...attempt, result }));
  if (!recorded) return { status: "outcome_not_recorded", deliveryId: claim.id };

  return { status: "outcome_recorded", deliveryId: claim.id, outcome: classifyTrainingReminderOutcome(result) };
}
