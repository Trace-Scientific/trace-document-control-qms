import { createPublicKey, verify as verifyCryptographicSignature } from "node:crypto";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationDeliveryRejectedError,
  type NormalizedInboundEvent,
  type PlatformIntegrationAdapter,
  type PlatformIntegrationWebhookEvidence,
} from "./integration-framework";

const ADAPTER_KEY = "sendgrid.email";
const ALLOWED_EVENT = "sendgrid.email.send";
const DELIVERY_EVENTS = new Set(["processed", "delivered", "deferred", "bounce", "dropped"]);
const DELIVERY_KEY_FIELD = "trace_delivery_key";

type JsonRecord = Record<string, unknown>;

type SendGridCredential = {
  apiKey: string;
};

type SendGridConfiguration = {
  region: "global" | "eu";
  fromEmail: string;
  fromName: string | null;
  webhookPublicKey: string | null;
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

function email(value: unknown, label: string): string {
  const normalized = text(value, label, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new PlatformIntegrationConfigurationError(`${label} is invalid`);
  return normalized;
}

function parseCredential(value: string | null): SendGridCredential {
  if (!value) throw new PlatformIntegrationConfigurationError("SendGrid credential bundle is required");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new PlatformIntegrationConfigurationError("SendGrid credential bundle is invalid JSON"); }
  const record = asRecord(parsed, "SendGrid credential bundle");
  return { apiKey: text(record.apiKey, "SendGrid API key", 4096) };
}

function parseConfiguration(value: unknown): SendGridConfiguration {
  const record = asRecord(value ?? {}, "SendGrid configuration");
  const region = record.region === "eu" ? "eu" : record.region === "global" || record.region == null ? "global" : null;
  if (!region) throw new PlatformIntegrationConfigurationError("SendGrid region must be global or eu");
  const fromEmail = email(record.fromEmail, "SendGrid from email");
  const fromName = record.fromName == null ? null : text(record.fromName, "SendGrid from name", 160);
  const webhookPublicKey = record.webhookPublicKey == null ? null : text(record.webhookPublicKey, "SendGrid webhook public key", 8192);
  return { region, fromEmail, fromName, webhookPublicKey };
}

function validatePayload(value: unknown) {
  const record = asRecord(value, "SendGrid email payload");
  const to = email(record.to, "Email recipient");
  const subject = text(record.subject, "Email subject", 998);
  const textBody = record.text == null ? null : text(record.text, "Email text", 100_000);
  const htmlBody = record.html == null ? null : text(record.html, "Email HTML", 200_000);
  if (!textBody && !htmlBody) throw new PlatformIntegrationConfigurationError("Email text or HTML content is required");
  if (record.attachments != null || record.personalizations != null || record.template_id != null || record.dynamic_template_data != null || record.custom_args != null) {
    throw new PlatformIntegrationConfigurationError("Advanced SendGrid payload features are not allowed in this release");
  }
  return { to, subject, textBody, htmlBody };
}

function endpoint(configuration: SendGridConfiguration) {
  return `${configuration.region === "eu" ? "https://api.eu.sendgrid.com" : "https://api.sendgrid.com"}/v3/mail/send`;
}

function decodeBase64(value: string, label: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new PlatformIntegrationConfigurationError(`${label} is not valid base64`);
  }
  return Buffer.from(value, "base64");
}

function verifySignedWebhook(input: PlatformIntegrationWebhookEvidence, configuration: SendGridConfiguration) {
  if (!configuration.webhookPublicKey) throw new PlatformIntegrationConfigurationError("SendGrid signed Event Webhook is not enabled for this connection");
  const signature = input.headers.get("x-twilio-email-event-webhook-signature")?.trim();
  const timestamp = input.headers.get("x-twilio-email-event-webhook-timestamp")?.trim();
  if (!signature) throw new PlatformIntegrationConfigurationError("SendGrid webhook signature is missing");
  if (!timestamp || !/^\d{1,20}$/.test(timestamp)) throw new PlatformIntegrationConfigurationError("SendGrid webhook timestamp is invalid");

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: decodeBase64(configuration.webhookPublicKey, "SendGrid webhook public key"),
      format: "der",
      type: "spki",
    });
  } catch (error) {
    if (error instanceof PlatformIntegrationConfigurationError) throw error;
    throw new PlatformIntegrationConfigurationError("SendGrid webhook public key is invalid");
  }
  if (publicKey.asymmetricKeyType !== "ec") throw new PlatformIntegrationConfigurationError("SendGrid webhook public key must be ECDSA");

  let verified = false;
  try {
    const signedPayload = Buffer.concat([Buffer.from(timestamp, "utf8"), Buffer.from(input.rawBodyBytes)]);
    verified = verifyCryptographicSignature("sha256", signedPayload, publicKey, decodeBase64(signature, "SendGrid webhook signature"));
  } catch (error) {
    if (error instanceof PlatformIntegrationConfigurationError) throw error;
    verified = false;
  }
  if (!verified) throw new PlatformIntegrationConfigurationError("SendGrid webhook signature is invalid");
}

function normalizeDeliveryEvents(rawBody: string): NormalizedInboundEvent {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { throw new PlatformIntegrationConfigurationError("SendGrid webhook body is not valid JSON"); }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 1000) {
    throw new PlatformIntegrationConfigurationError("SendGrid webhook must contain a bounded event array");
  }

  const events = parsed.map((value, index) => {
    const event = asRecord(value, `SendGrid event ${index + 1}`);
    const deliveryKey = text(event[DELIVERY_KEY_FIELD], "SendGrid Trace delivery key", 240);
    const eventType = text(event.event, "SendGrid event type", 40).toLowerCase();
    if (!DELIVERY_EVENTS.has(eventType)) throw new PlatformIntegrationConfigurationError("SendGrid webhook event type is not supported");
    const eventId = text(event.sg_event_id, "SendGrid event ID", 200);
    const messageId = text(event.sg_message_id, "SendGrid message ID", 500);
    return { deliveryKey, eventType, eventId, messageId };
  });

  return {
    eventType: "sendgrid.email.delivery_status",
    providerEventId: events.length === 1 ? events[0].eventId : null,
    payload: { events },
  };
}

export class SendGridEmailAdapter implements PlatformIntegrationAdapter {
  readonly key = ADAPTER_KEY;

  async deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }) {
    if (input.eventType !== ALLOWED_EVENT) throw new PlatformIntegrationConfigurationError("SendGrid outbound event type is not allowed");
    const credential = parseCredential(input.credential);
    const configuration = parseConfiguration(input.configuration);
    const payload = validatePayload(input.payload);
    const content: Array<{ type: string; value: string }> = [];
    if (payload.textBody) content.push({ type: "text/plain", value: payload.textBody });
    if (payload.htmlBody) content.push({ type: "text/html", value: payload.htmlBody });
    const response = await fetch(endpoint(configuration), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: payload.to }],
          custom_args: { [DELIVERY_KEY_FIELD]: input.idempotencyKey },
        }],
        from: configuration.fromName ? { email: configuration.fromEmail, name: configuration.fromName } : { email: configuration.fromEmail },
        subject: payload.subject,
        content,
      }),
    });
    if (!response.ok) {
      if (response.status === 429) throw new PlatformIntegrationDeliveryRejectedError("SendGrid request was rate limited", true);
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        throw new PlatformIntegrationDeliveryRejectedError(`SendGrid request was rejected with HTTP ${response.status}`, false);
      }
      throw new Error(`SendGrid provider outcome is ambiguous after HTTP ${response.status}`);
    }
    return {
      providerRequestId: response.headers.get("x-message-id")?.slice(0, 500) ?? null,
      providerOutcome: "SENDGRID_ACCEPTED",
    };
  }

  async verifyAndNormalizeWebhook(input: PlatformIntegrationWebhookEvidence & { configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    const configuration = parseConfiguration(input.configuration);
    parseCredential(input.credential);
    verifySignedWebhook(input, configuration);
    return normalizeDeliveryEvents(input.rawBody);
  }
}
