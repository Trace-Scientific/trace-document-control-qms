import { PlatformIntegrationConfigurationError, type NormalizedInboundEvent, type PlatformIntegrationAdapter } from "./integration-framework";

const ADAPTER_KEY = "sendgrid.email";
const ALLOWED_EVENT = "sendgrid.email.send";

type JsonRecord = Record<string, unknown>;

type SendGridCredential = {
  apiKey: string;
};

type SendGridConfiguration = {
  region: "global" | "eu";
  fromEmail: string;
  fromName: string | null;
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
  return { region, fromEmail, fromName };
}

function validatePayload(value: unknown) {
  const record = asRecord(value, "SendGrid email payload");
  const to = email(record.to, "Email recipient");
  const subject = text(record.subject, "Email subject", 998);
  const textBody = record.text == null ? null : text(record.text, "Email text", 100_000);
  const htmlBody = record.html == null ? null : text(record.html, "Email HTML", 200_000);
  if (!textBody && !htmlBody) throw new PlatformIntegrationConfigurationError("Email text or HTML content is required");
  if (record.attachments != null || record.personalizations != null || record.template_id != null || record.dynamic_template_data != null) {
    throw new PlatformIntegrationConfigurationError("Advanced SendGrid payload features are not allowed in this release");
  }
  return { to, subject, textBody, htmlBody };
}

function endpoint(configuration: SendGridConfiguration) {
  return `${configuration.region === "eu" ? "https://api.eu.sendgrid.com" : "https://api.sendgrid.com"}/v3/mail/send`;
}

export class SendGridEmailAdapter implements PlatformIntegrationAdapter {
  readonly key = ADAPTER_KEY;

  async deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }): Promise<void> {
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
        personalizations: [{ to: [{ email: payload.to }] }],
        from: configuration.fromName ? { email: configuration.fromEmail, name: configuration.fromName } : { email: configuration.fromEmail },
        subject: payload.subject,
        content,
      }),
    });
    if (!response.ok) throw new Error(`SendGrid request failed with HTTP ${response.status}`);
  }

  async verifyAndNormalizeWebhook(_input: { rawBody: string; headers: Headers; configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    throw new PlatformIntegrationConfigurationError("SendGrid inbound events are disabled until raw-byte signature verification is available");
  }
}
