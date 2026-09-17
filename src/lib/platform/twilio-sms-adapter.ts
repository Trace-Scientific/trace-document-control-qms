import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationDeliveryRejectedError,
  type NormalizedInboundEvent,
  type PlatformIntegrationAdapter,
} from "./integration-framework";

const ADAPTER_KEY = "twilio.sms";
const ALLOWED_EVENT = "twilio.sms.send";

type JsonRecord = Record<string, unknown>;

type TwilioCredential = {
  accountSid: string;
  authToken: string;
};

type TwilioConfiguration = {
  fromNumber: string;
};

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  return value as JsonRecord;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

function e164(value: unknown, label: string): string {
  const normalized = text(value, label, 32);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new PlatformIntegrationConfigurationError(`${label} must be E.164`);
  return normalized;
}

function parseCredential(value: string | null): TwilioCredential {
  if (!value) throw new PlatformIntegrationConfigurationError("Twilio credential bundle is required");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new PlatformIntegrationConfigurationError("Twilio credential bundle is invalid JSON"); }
  const record = asRecord(parsed, "Twilio credential bundle");
  const accountSid = text(record.accountSid, "Twilio account SID", 64);
  if (!/^AC[a-zA-Z0-9]{32}$/.test(accountSid)) throw new PlatformIntegrationConfigurationError("Twilio account SID is invalid");
  return { accountSid, authToken: text(record.authToken, "Twilio auth token", 256) };
}

function parseConfiguration(value: unknown): TwilioConfiguration {
  const record = asRecord(value ?? {}, "Twilio configuration");
  return { fromNumber: e164(record.fromNumber, "Twilio from number") };
}

function validatePayload(value: unknown) {
  const record = asRecord(value, "Twilio SMS payload");
  if (record.mediaUrl != null || record.messagingServiceSid != null || record.statusCallback != null) {
    throw new PlatformIntegrationConfigurationError("Advanced Twilio messaging features are not allowed in this release");
  }
  return { to: e164(record.to, "SMS recipient"), body: text(record.body, "SMS body", 1600) };
}

export class TwilioSmsAdapter implements PlatformIntegrationAdapter {
  readonly key = ADAPTER_KEY;

  async deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }) {
    if (input.eventType !== ALLOWED_EVENT) throw new PlatformIntegrationConfigurationError("Twilio outbound event type is not allowed");
    const credential = parseCredential(input.credential);
    const configuration = parseConfiguration(input.configuration);
    const payload = validatePayload(input.payload);
    const form = new URLSearchParams();
    form.set("To", payload.to);
    form.set("From", configuration.fromNumber);
    form.set("Body", payload.body);
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credential.accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credential.accountSid}:${credential.authToken}`, "utf8").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!response.ok) {
      if (response.status === 429) throw new PlatformIntegrationDeliveryRejectedError("Twilio request was rate limited", true);
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        throw new PlatformIntegrationDeliveryRejectedError(`Twilio request was rejected with HTTP ${response.status}`, false);
      }
      throw new Error(`Twilio provider outcome is ambiguous after HTTP ${response.status}`);
    }
    const body = await response.json() as Record<string, unknown>;
    const sid = typeof body.sid === "string" ? body.sid.slice(0, 500) : null;
    const status = typeof body.status === "string" ? body.status.slice(0, 160) : "accepted";
    return { providerObjectId: sid, providerOutcome: `TWILIO_${status.toUpperCase()}` };
  }

  async verifyAndNormalizeWebhook(_input: { rawBody: string; headers: Headers; configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    throw new PlatformIntegrationConfigurationError("Twilio inbound callbacks are disabled until canonical URL/form signature verification is available");
  }
}
