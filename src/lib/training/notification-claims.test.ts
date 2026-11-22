import { Prisma } from "@prisma/client";
import { expect, test, vi } from "vitest";
import { recordTrainingRenewalDeliveryOutcome } from "./notification-claims";
import { classifyTrainingReminderOutcome } from "./notification-delivery-outcome";

const organizationId = "19edf975-eb67-47f2-b3bf-b8d20653e72c";
const deliveryId = "26db892d-5677-4b58-8a0e-d5fc4cae16b0";
const actorUserId = "387bac9d-a92f-4d34-8f89-3b539ddb2232";
const attempt = { organizationId, deliveryId, actorUserId, attemptCount: 2 };

function mockTransaction(rows: { id: string }[]) {
  const query = vi.fn(async (_sql: Prisma.Sql) => rows);
  const audit = vi.fn(async () => undefined);
  const transaction = {
    $queryRaw: query,
    auditEvent: { create: audit },
  } as unknown as Prisma.TransactionClient;
  return { transaction, query, audit };
}

test("records an uncertain provider outcome for review without retaining provider details", async () => {
  const { transaction, query, audit } = mockTransaction([{ id: deliveryId }]);
  const providerResult = { status: "unknown", reason: "Timeout for trainee@example.test" } as const;

  await expect(recordTrainingRenewalDeliveryOutcome(transaction, {
    ...attempt,
    outcome: classifyTrainingReminderOutcome(providerResult),
    error: providerResult.reason,
  })).resolves.toBe(true);

  const statement = query.mock.calls[0][0];
  expect(statement.values).toEqual([
    "REVIEW_REQUIRED",
    "REVIEW_REQUIRED",
    "Provider delivery could not be confirmed",
    organizationId,
    deliveryId,
    2,
  ]);
  expect(statement.text).toContain('AND "status" = \'SENDING\' AND "attemptCount" = $6');
  expect(audit).toHaveBeenCalledExactlyOnceWith({
    data: {
      organizationId,
      actorUserId,
      action: "TRAINING_NOTIFICATION_REVIEW_REQUIRED",
      entityType: "TrainingRenewalNotificationDelivery",
      entityId: deliveryId,
      metadata: { attemptCount: 2, errorRecorded: true, reason: "provider_delivery_unknown" },
    },
  });
});

test.each([
  ["SENT", null, false],
  ["FAILED", "Delivery failed", false],
] as const)("retains the %s outcome and its audit event", async (outcome, error, errorRecorded) => {
  const { transaction, query, audit } = mockTransaction([{ id: deliveryId }]);

  await expect(recordTrainingRenewalDeliveryOutcome(transaction, { ...attempt, outcome })).resolves.toBe(true);

  expect(query.mock.calls[0][0].values[2]).toBe(error);
  expect(audit).toHaveBeenCalledExactlyOnceWith({
    data: {
      organizationId,
      actorUserId,
      action: `TRAINING_NOTIFICATION_${outcome}`,
      entityType: "TrainingRenewalNotificationDelivery",
      entityId: deliveryId,
      metadata: { attemptCount: 2, errorRecorded },
    },
  });
});

test("does not audit duplicate, wrong-tenant, or stale attempts that update no row", async () => {
  const { transaction, audit } = mockTransaction([]);

  await expect(recordTrainingRenewalDeliveryOutcome(transaction, {
    ...attempt,
    outcome: "REVIEW_REQUIRED",
  })).resolves.toBe(false);

  expect(audit).not.toHaveBeenCalled();
});
