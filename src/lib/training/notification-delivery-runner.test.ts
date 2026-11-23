import type { Prisma, PrismaClient } from "@prisma/client";
import { beforeEach, expect, test, vi } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { runTrainingReminderDelivery } from "./notification-delivery-runner";
import {
  RecordingTrainingReminderProvider,
  TRAINING_REMINDER_PROVIDER_TIMEOUT_MS,
  type DeliveryAuthorization,
  type TrainingReminderDeliveryResult,
  type TrainingReminderProvider,
} from "./notification-delivery-provider";

const { claimNext, resolveMessage, recordResult, recordOutcome } = vi.hoisted(() => ({
  claimNext: vi.fn(), resolveMessage: vi.fn(), recordResult: vi.fn(), recordOutcome: vi.fn(),
}));
vi.mock("./notification-claims", () => ({
  claimTrainingRenewalNotifications: claimNext,
  recordTrainingRenewalProviderResult: recordResult,
  recordTrainingRenewalDeliveryOutcome: recordOutcome,
}));
vi.mock("./notification-recipient", () => ({ resolveTrainingReminderMessage: resolveMessage }));

const context: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: [{ permission: "training.manage", scopeType: "ORGANIZATION", scopeId: null }],
};
const authorization: DeliveryAuthorization = {
  outboundEnabled: true, demoEnvironment: false, tenantScheduleEnabled: true,
  tenantPreferencesEnabled: true, providerVerified: true,
};
const claim = { id: "26db892d-5677-4b58-8a0e-d5fc4cae16b0", attemptCount: 1 };
const attempt = { organizationId: context.organizationId, deliveryId: claim.id, attemptCount: 1, actorUserId: context.userId };
const message = {
  organizationId: context.organizationId, deliveryId: claim.id, idempotencyKey: `training-reminder:${claim.id}`,
  recipientEmail: "trainee@example.test", subject: "Training reminder", text: "Training is due soon.",
};

function mockDb() {
  const tx = {} as Prisma.TransactionClient;
  let transactionActive = false;
  const transaction = vi.fn(async (work: (client: Prisma.TransactionClient) => Promise<unknown>) => {
    transactionActive = true;
    try {
      return await work(tx);
    } finally {
      transactionActive = false;
    }
  });
  return {
    db: { $transaction: transaction } as unknown as Pick<PrismaClient, "$transaction" | "$queryRaw">,
    tx, transaction, isTransactionActive: () => transactionActive,
  };
}

beforeEach(() => {
  claimNext.mockReset().mockResolvedValue([claim]);
  resolveMessage.mockReset().mockResolvedValue(message);
  recordResult.mockReset().mockResolvedValue(true);
  recordOutcome.mockReset().mockResolvedValue(true);
});

test("requires a training manager and permitted outbound delivery before claiming", async () => {
  const { db, transaction } = mockDb();
  const provider = new RecordingTrainingReminderProvider();
  await expect(runTrainingReminderDelivery(db, { ...context, grants: [] }, provider, authorization)).rejects.toThrow("Access denied");
  await expect(runTrainingReminderDelivery(db, context, provider, { ...authorization, demoEnvironment: true }))
    .rejects.toThrow("not authorized");
  expect(transaction).not.toHaveBeenCalled();
  expect(provider.messages).toEqual([]);
});

test("returns without resolving a recipient or calling the provider when no reminder is claimed", async () => {
  const { db } = mockDb();
  const provider = new RecordingTrainingReminderProvider();
  claimNext.mockResolvedValue([]);
  await expect(runTrainingReminderDelivery(db, context, provider, authorization)).resolves.toEqual({ status: "no_eligible_reminder" });
  expect(resolveMessage).not.toHaveBeenCalled();
  expect(provider.messages).toEqual([]);
});

test("calls the provider once outside the claim and outcome transactions", async () => {
  const { db, tx, transaction, isTransactionActive } = mockDb();
  const provider = new RecordingTrainingReminderProvider();
  const deliver = vi.fn(async (input: typeof message) => {
    expect(isTransactionActive()).toBe(false);
    return provider.deliver(input);
  });
  await expect(runTrainingReminderDelivery(db, context, { deliver }, authorization)).resolves.toEqual({
    status: "outcome_recorded", deliveryId: claim.id, outcome: "SENT",
  });
  expect(claimNext).toHaveBeenCalledExactlyOnceWith(tx, context.organizationId, 1, context.userId);
  expect(resolveMessage).toHaveBeenCalledExactlyOnceWith(db, attempt);
  expect(deliver).toHaveBeenCalledExactlyOnceWith(message, expect.any(AbortSignal));
  expect(recordResult).toHaveBeenCalledExactlyOnceWith(tx, {
    ...attempt, result: { status: "accepted", providerMessageId: "test-1" },
  });
  expect(transaction).toHaveBeenCalledTimes(2);
});

test("makes no provider call when current eligibility or recipient resolution fails", async () => {
  const { db, tx } = mockDb();
  const provider = new RecordingTrainingReminderProvider();
  resolveMessage.mockResolvedValue(null);
  await expect(runTrainingReminderDelivery(db, context, provider, authorization)).resolves.toEqual({
    status: "recipient_unavailable", deliveryId: claim.id,
  });
  expect(provider.messages).toEqual([]);
  expect(recordResult).not.toHaveBeenCalled();
  expect(recordOutcome).toHaveBeenCalledExactlyOnceWith(tx, {
    ...attempt, outcome: "FAILED", error: "Reminder no longer qualifies or no active recipient is available",
  });
});

test("passes a provider exception to manual review after one call", async () => {
  const { db, tx } = mockDb();
  const deliver = vi.fn().mockRejectedValue(new Error("Provider timeout"));
  await expect(runTrainingReminderDelivery(db, context, { deliver }, authorization)).resolves.toEqual({
    status: "outcome_recorded", deliveryId: claim.id, outcome: "REVIEW_REQUIRED",
  });
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(recordResult).toHaveBeenCalledExactlyOnceWith(tx, {
    ...attempt, result: { status: "unknown", reason: "Provider delivery could not be confirmed" },
  });
});

test("records a stalled provider for review and ignores late acceptance", async () => {
  vi.useFakeTimers();
  try {
    const { db, tx } = mockDb();
    let accept: (result: TrainingReminderDeliveryResult) => void = () => {
      throw new Error("Provider was never called");
    };
    const pending = new Promise<TrainingReminderDeliveryResult>((resolve) => {
      accept = resolve;
    });
    const deliver = vi.fn<TrainingReminderProvider["deliver"]>(() => pending);
    const run = runTrainingReminderDelivery(db, context, { deliver }, authorization);

    await vi.advanceTimersByTimeAsync(TRAINING_REMINDER_PROVIDER_TIMEOUT_MS - 1);
    expect(deliver).toHaveBeenCalledTimes(1);
    const signal = deliver.mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    expect(recordResult).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(run).resolves.toEqual({
      status: "outcome_recorded", deliveryId: claim.id, outcome: "REVIEW_REQUIRED",
    });
    expect(signal.aborted).toBe(true);
    expect(recordResult).toHaveBeenCalledExactlyOnceWith(tx, {
      ...attempt, result: { status: "unknown", reason: "Provider delivery could not be confirmed" },
    });

    accept({ status: "accepted", providerMessageId: "late-receipt" });
    await vi.advanceTimersByTimeAsync(0);
    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test("reports when a provider response could not be applied and does not send a second time", async () => {
  const { db } = mockDb();
  const provider = new RecordingTrainingReminderProvider();
  recordResult.mockResolvedValue(false);
  await expect(runTrainingReminderDelivery(db, context, provider, authorization)).resolves.toEqual({
    status: "outcome_not_recorded", deliveryId: claim.id,
  });
  expect(provider.messages).toHaveLength(1);
});

test("propagates a failed outcome transaction without attempting delivery again", async () => {
  const { db } = mockDb();
  const provider = new RecordingTrainingReminderProvider();
  recordResult.mockRejectedValue(new Error("Audit write failed"));
  await expect(runTrainingReminderDelivery(db, context, provider, authorization)).rejects.toThrow("Audit write failed");
  expect(provider.messages).toHaveLength(1);
});
