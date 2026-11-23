/**
 * Provider-neutral training reminder delivery boundary.
 *
 * This module deliberately has no network client or configured email provider.
 * A provider must be injected by a separately reviewed worker after explicit
 * environment authorization. Preview mode cannot invoke the provider.
 */
export type TrainingReminderMessage = Readonly<{
  deliveryId: string;
  organizationId: string;
  recipientEmail: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}>;

export type TrainingReminderDeliveryResult =
  | Readonly<{ status: "accepted"; providerMessageId: string }>
  | Readonly<{ status: "rejected"; reason: string }>
  | Readonly<{ status: "unknown"; reason: string }>;

/** Provider identifiers are opaque, but only bounded visible ASCII is safe to retain. */
export function trainingReminderProviderReceipt(result: TrainingReminderDeliveryResult): string | null {
  if (result.status !== "accepted") return null;
  const receipt = result.providerMessageId.trim();
  return /^[!-~]{1,512}$/.test(receipt) ? receipt : null;
}

export interface TrainingReminderProvider {
  deliver(message: TrainingReminderMessage): Promise<TrainingReminderDeliveryResult>;
}

export type DeliveryAuthorization = Readonly<{
  outboundEnabled: boolean;
  demoEnvironment: boolean;
  tenantScheduleEnabled: boolean;
  tenantPreferencesEnabled: boolean;
  providerVerified: boolean;
}>;

export function assertTrainingReminderDeliveryAuthorized(
  authorization: DeliveryAuthorization,
): void {
  if (
    !authorization.outboundEnabled ||
    authorization.demoEnvironment ||
    !authorization.tenantScheduleEnabled ||
    !authorization.tenantPreferencesEnabled ||
    !authorization.providerVerified
  ) {
    throw new Error("Training reminder outbound delivery is not authorized");
  }
}

export function isTrainingReminderEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Explicit invocation only; never used by dry-run routes or schedulers. */
export async function deliverTrainingReminder(
  provider: TrainingReminderProvider,
  message: TrainingReminderMessage,
  authorization: DeliveryAuthorization,
): Promise<TrainingReminderDeliveryResult> {
  assertTrainingReminderDeliveryAuthorized(authorization);
  if (!message.deliveryId || !message.organizationId || !message.idempotencyKey) {
    throw new Error("Missing notification delivery identity");
  }
  if (!isTrainingReminderEmail(message.recipientEmail)) {
    throw new Error("Invalid notification recipient");
  }
  if (!message.subject.trim() || !message.text.trim()) {
    throw new Error("Empty notification content");
  }
  let result: TrainingReminderDeliveryResult;
  try {
    result = await provider.deliver(message);
  } catch {
    // A transport failure can occur after the provider accepted the message.
    return { status: "unknown", reason: "Provider delivery could not be confirmed" };
  }
  if (result.status === "accepted" && !trainingReminderProviderReceipt(result)) {
    return { status: "unknown", reason: "Provider accepted without a usable receipt identifier" };
  }
  return result;
}

/**
 * In-memory test double for isolated integration tests. Never sends email.
 */
export class RecordingTrainingReminderProvider implements TrainingReminderProvider {
  readonly messages: TrainingReminderMessage[] = [];

  async deliver(message: TrainingReminderMessage): Promise<TrainingReminderDeliveryResult> {
    this.messages.push(message);
    return { status: "accepted", providerMessageId: `test-${this.messages.length}` };
  }
}
