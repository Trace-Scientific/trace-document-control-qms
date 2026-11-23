import { Prisma } from "@prisma/client";
import { expect, test, vi } from "vitest";
import { claimTrainingRenewalNotifications, recordTrainingRenewalDeliveryOutcome, recordTrainingRenewalProviderResult } from "./notification-claims";
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
    null,
    organizationId,
    deliveryId,
    2,
  ]);
  expect(statement.text).toContain('AND "status" = \'SENDING\' AND "attemptCount" = $7');
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

test("claims only reminders that still match a current eligible renewal and an enabled schedule", async () => {
  const claim = { id: deliveryId, organizationId, attemptCount: 2, reminderType: "DUE_7" };
  const { transaction, query, audit } = mockTransaction([claim]);

  await expect(claimTrainingRenewalNotifications(transaction, organizationId, 10, actorUserId)).resolves.toEqual([claim]);

  const statement = query.mock.calls[0][0];
  expect(statement.values).toEqual([...Array(5).fill(organizationId), 10, organizationId]);
  expect(statement.text).toContain('c."completionId" = d."completionId" AND c."dueDate" = d."renewalDueDate"');
  expect(statement.text).toContain('c."reminderType" = d."reminderType"');
  expect(statement.text).toContain(`WHERE e."status"::text = 'ACTIVE'`);
  expect(statement.text).toContain('s."organizationId" = d."organizationId" AND s."enabled"');
  expect(statement.text).toContain("FOR UPDATE OF d SKIP LOCKED");
  expect(audit).toHaveBeenCalledExactlyOnceWith({
    data: {
      organizationId,
      actorUserId,
      action: "TRAINING_NOTIFICATION_CLAIMED",
      entityType: "TrainingRenewalNotificationDelivery",
      entityId: deliveryId,
      metadata: { attemptCount: 2, reminderType: "DUE_7" },
    },
  });
});

test("retains an accepted receipt on the claim and audits only its presence", async () => {
  const { transaction, query, audit } = mockTransaction([{ id: deliveryId }]);
  await expect(recordTrainingRenewalProviderResult(transaction, {
    ...attempt,
    result: { status: "accepted", providerMessageId: " receipt-123 " },
  })).resolves.toBe(true);
  expect(query.mock.calls[0][0].values).toEqual([
    "SENT", "SENT", null, "receipt-123", organizationId, deliveryId, 2,
  ]);
  expect(audit).toHaveBeenCalledExactlyOnceWith({
    data: {
      organizationId, actorUserId, action: "TRAINING_NOTIFICATION_SENT",
      entityType: "TrainingRenewalNotificationDelivery", entityId: deliveryId,
      metadata: { attemptCount: 2, errorRecorded: false, providerReceiptRecorded: true },
    },
  });
});

test.each([" ", "two words", "x".repeat(513)])("sends an unusable acceptance receipt to review", async (providerMessageId) => {
  const { transaction, query } = mockTransaction([{ id: deliveryId }]);
  await expect(recordTrainingRenewalProviderResult(transaction, {
    ...attempt,
    result: { status: "accepted", providerMessageId },
  })).resolves.toBe(true);
  expect(query.mock.calls[0][0].values.slice(0, 4)).toEqual([
    "REVIEW_REQUIRED", "REVIEW_REQUIRED", "Provider delivery could not be confirmed", null,
  ]);
});

test("records provider rejection without retaining the provider's raw error", async () => {
  const { transaction, query } = mockTransaction([{ id: deliveryId }]);
  await expect(recordTrainingRenewalProviderResult(transaction, {
    ...attempt,
    result: { status: "rejected", reason: "Provider response for trainee@example.test" },
  })).resolves.toBe(true);
  expect(query.mock.calls[0][0].values.slice(0, 4)).toEqual(["FAILED", "FAILED", "Delivery failed", null]);
});
