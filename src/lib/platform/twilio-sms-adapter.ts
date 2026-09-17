import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationDeliveryRejectedError,
  type NormalizedInboundEvent,
  type PlatformIntegrationAdapter,
  type PlatformIntegrationWebhookEvidence,
} from "./integration-framework";

const ADAPTER_KEY = "twilio.sms";
const ALLOWED_EVENT = "twilio.sms.send";
const STATUS_CALLBACK_PATH = "/api/platform/integrations/inbound/";
const ALLOWED_MESSAGE_STATUSES = new Set(["accepted", "scheduled", "queued", "sending", "sent", "delivered", "undelivered", "failed", "canceled", "read"]);

type JsonRecord = Record<string, unknown>;

type TwilioCredential = {
  accountSid: string;
  authToken: string;
};

type TwilioConfiguration = {
  fromNumber: string;
  callbackBaseUrl: string | null;
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
  if (!/^AC[a-fA-F0-9]{32}$/.test(accountSid)) throw new PlatformIntegrationConfigurationError("Twilio account SID is invalid");
  return { accountSid, authToken: text(record.authToken, "Twilio auth token", 256) };
}

function callbackBaseUrl(value: unknown): string | null {
  if (value == null) return null;
  const raw = text(value, "Twilio callback base URL", 1024);
  let url: URL;
  try { url = new URL(raw); } catch { throw new PlatformIntegrationConfigurationError("Twilio callback base URL is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new PlatformIntegrationConfigurationError("Twilio callback base URL must be a bare HTTPS origin");
  }
  return url.origin;
}

function parseConfiguration(value: unknown): TwilioConfiguration {
  const record = asRecord(value ?? {}, "Twilio configuration");
  return {
    fromNumber: e164(record.fromNumber, "Twilio from number"),
    callbackBaseUrl: callbackBaseUrl(record.callbackBaseUrl),
  };
}

function validatePayload(value: unknown) {
  const record = asRecord(value, "Twilio SMS payload");
  if (record.mediaUrl != null || record.messagingServiceSid != null || record.statusCallback != null) {
    throw new PlatformIntegrationConfigurationError("Advanced Twilio messaging features are not allowed in this release");
  }
  return { to: e164(record.to, "SMS recipient"), body: text(record.body, "SMS body", 1600) };
}

function statusCallbackUrl(configuration: TwilioConfiguration, connectionId: string, deliveryKey: string) {
  if (!configuration.callbackBaseUrl) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(connectionId)) throw new PlatformIntegrationConfigurationError("Integration connection ID is invalid");
  const url = new URL(`${STATUS_CALLBACK_PATH}${connectionId}`, `${configuration.callbackBaseUrl}/`);
  url.searchParams.set("deliveryKey", deliveryKey);
  return url.toString();
}

function requireSingleFormValue(parameters: Readonly<Record<string, readonly string[]>>, name: string, max: number) {
  const values = parameters[name];
  if (!values || values.length !== 1) throw new PlatformIntegrationConfigurationError(`Twilio ${name} is missing or duplicated`);
  return text(values[0], `Twilio ${name}`, max);
}

function validateCallbackRequest(input: PlatformIntegrationWebhookEvidence, configuration: TwilioConfiguration, credential: TwilioCredential) {
  if (!configuration.callbackBaseUrl) throw new PlatformIntegrationConfigurationError("Twilio signed callbacks are not enabled for this connection");
  if (!input.formParameters) throw new PlatformIntegrationConfigurationError("Twilio callback must be form encoded");

  let requestUrl: URL;
  try { requestUrl = new URL(input.requestUrl); } catch { throw new PlatformIntegrationConfigurationError("Twilio callback URL is invalid"); }
  if (requestUrl.origin !== configuration.callbackBaseUrl || !requestUrl.pathname.startsWith(STATUS_CALLBACK_PATH)) {
    throw new PlatformIntegrationConfigurationError("Twilio callback URL does not match the configured platform origin");
  }
  const connectionSegment = requestUrl.pathname.slice(STATUS_CALLBACK_PATH.length);
  if (!/^[0-9a-fA-F-]{36}$/.test(connectionSegment) || connectionSegment.includes("/")) {
    throw new PlatformIntegrationConfigurationError("Twilio callback path is invalid");
  }
  const deliveryKey = requestUrl.searchParams.get("deliveryKey");
  if (!deliveryKey || deliveryKey.length > 240) throw new PlatformIntegrationConfigurationError("Twilio callback delivery correlation is missing");

  const accountSid = requireSingleFormValue(input.formParameters, "AccountSid", 64);
  if (accountSid !== credential.accountSid) throw new PlatformIntegrationConfigurationError("Twilio callback account does not match the configured account");

  const signature = input.headers.get("x-twilio-signature")?.trim();
  if (!signature) throw new PlatformIntegrationConfigurationError("Twilio callback signature is missing");
  const canonicalParts = [input.requestUrl];
  for (const name of Object.keys(input.formParameters).sort()) {
    const values = input.formParameters[name];
    if (values.length !== 1) throw new PlatformIntegrationConfigurationError("Twilio callback contains duplicate form parameters");
    canonicalParts.push(name, values[0]);
  }
  const expected = createHmac("sha1", credential.authToken).update(canonicalParts.join(""), "utf8").digest("base64");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    throw new PlatformIntegrationConfigurationError("Twilio callback signature is invalid");
  }

  return { deliveryKey, parameters: input.formParameters };
}

export class TwilioSmsAdapter implements PlatformIntegrationAdapter {
  readonly key = ADAPTER_KEY;

  async deliver(input: { connectionId: string; eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }) {
    if (input.eventType !== ALLOWED_EVENT) throw new PlatformIntegrationConfigurationError("Twilio outbound event type is not allowed");
    const credential = parseCredential(input.credential);
    const configuration = parseConfiguration(input.configuration);
    const payload = validatePayload(input.payload);
    const form = new URLSearchParams();
    form.set("To", payload.to);
    form.set("From", configuration.fromNumber);
    form.set("Body", payload.body);
    const callbackUrl = statusCallbackUrl(configuration, input.connectionId, input.idempotencyKey);
    if (callbackUrl) form.set("StatusCallback", callbackUrl);
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

  async verifyAndNormalizeWebhook(input: PlatformIntegrationWebhookEvidence & { configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    const credential = parseCredential(input.credential);
    const configuration = parseConfiguration(input.configuration);
    const { deliveryKey, parameters } = validateCallbackRequest(input, configuration, credential);
    const messageSid = requireSingleFormValue(parameters, "MessageSid", 64);
    if (!/^SM[a-fA-F0-9]{32}$/.test(messageSid)) throw new PlatformIntegrationConfigurationError("Twilio callback MessageSid is invalid");
    const messageStatus = requireSingleFormValue(parameters, "MessageStatus", 40).toLowerCase();
    if (!ALLOWED_MESSAGE_STATUSES.has(messageStatus)) throw new PlatformIntegrationConfigurationError("Twilio callback message status is not supported");
    const errorCodeValues = parameters.ErrorCode;
    const errorCode = errorCodeValues?.length === 1 && errorCodeValues[0] ? errorCodeValues[0].slice(0, 40) : null;
    return {
      eventType: "twilio.sms.status",
      providerEventId: `${messageSid}:${messageStatus}`,
      payload: {
        deliveryKey,
        messageSid,
        messageStatus,
        errorCode,
      },
    };
  }
}
