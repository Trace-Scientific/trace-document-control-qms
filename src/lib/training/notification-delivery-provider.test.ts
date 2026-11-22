import assert from "node:assert/strict";
import { test } from "vitest";
import { classifyTrainingReminderOutcome } from "./notification-delivery-outcome";
import {
  deliverTrainingReminder,
  RecordingTrainingReminderProvider,
  type DeliveryAuthorization,
  type TrainingReminderDeliveryResult,
  type TrainingReminderMessage,
} from "./notification-delivery-provider";

const authorized: DeliveryAuthorization = {
  outboundEnabled: true,
  demoEnvironment: false,
  tenantScheduleEnabled: true,
  tenantPreferencesEnabled: true,
  providerVerified: true,
};

const message: TrainingReminderMessage = {
  deliveryId: "delivery-1",
  organizationId: "organization-1",
  recipientEmail: "trainee@example.test",
  subject: "Training reminder",
  text: "Your training is due soon.",
  idempotencyKey: "organization-1:delivery-1",
};

const blockedAuthorizations: [string, Partial<DeliveryAuthorization>][] = [
  ["outbound delivery disabled", { outboundEnabled: false }],
  ["demo environment", { demoEnvironment: true }],
  ["tenant schedule disabled", { tenantScheduleEnabled: false }],
  ["tenant preferences disabled", { tenantPreferencesEnabled: false }],
  ["provider unverified", { providerVerified: false }],
];

for (const [label, override] of blockedAuthorizations) {
  test(`blocks provider calls when ${label}`, async () => {
    const provider = new RecordingTrainingReminderProvider();
    await assert.rejects(
      deliverTrainingReminder(provider, message, { ...authorized, ...override }),
      /outbound delivery is not authorized/,
    );
    assert.deepEqual(provider.messages, []);
  });
}

test("validates delivery identity, recipient, and content before invoking the provider", async () => {
  const provider = new RecordingTrainingReminderProvider();
  const invalidMessages: [Partial<TrainingReminderMessage>, RegExp][] = [
    [{ deliveryId: "" }, /Missing notification delivery identity/],
    [{ organizationId: "" }, /Missing notification delivery identity/],
    [{ idempotencyKey: "" }, /Missing notification delivery identity/],
    [{ recipientEmail: "trainee @example.test" }, /Invalid notification recipient/],
    [{ subject: " " }, /Empty notification content/],
    [{ text: "" }, /Empty notification content/],
  ];

  for (const [override, expectedError] of invalidMessages) {
    await assert.rejects(
      deliverTrainingReminder(provider, { ...message, ...override }, authorized),
      expectedError,
    );
  }
  assert.deepEqual(provider.messages, []);
});

test("passes delivery identity through and records a provider receipt as accepted", async () => {
  const provider = new RecordingTrainingReminderProvider();
  const result = await deliverTrainingReminder(provider, message, authorized);

  assert.deepEqual(provider.messages, [message]);
  assert.deepEqual(result, { status: "accepted", providerMessageId: "test-1" });
  assert.equal(classifyTrainingReminderOutcome(result), "SENT");
});

const providerOutcomes: [TrainingReminderDeliveryResult, "FAILED" | "REVIEW_REQUIRED"][] = [
  [{ status: "rejected", reason: "Address rejected" }, "FAILED"],
  [{ status: "unknown", reason: "No acknowledgment" }, "REVIEW_REQUIRED"],
  [{ status: "accepted", providerMessageId: " " }, "REVIEW_REQUIRED"],
];

for (const [providerResult, expectedStatus] of providerOutcomes) {
  test(`classifies a provider response of ${JSON.stringify(providerResult)} as ${expectedStatus}`, async () => {
    const result = await deliverTrainingReminder(
      { deliver: async () => providerResult },
      message,
      authorized,
    );

    if (providerResult.status === "accepted") {
      assert.equal(result.status, "unknown");
    }
    assert.equal(classifyTrainingReminderOutcome(result), expectedStatus);
  });
}

test("routes an uncertain provider exception to review after one attempt", async () => {
  let attempts = 0;
  const result = await deliverTrainingReminder(
    {
      async deliver() {
        attempts += 1;
        throw new Error("Provider timeout for trainee@example.test");
      },
    },
    message,
    authorized,
  );

  assert.equal(attempts, 1);
  assert.deepEqual(result, {
    status: "unknown",
    reason: "Provider delivery could not be confirmed",
  });
  assert.equal(classifyTrainingReminderOutcome(result), "REVIEW_REQUIRED");
});
