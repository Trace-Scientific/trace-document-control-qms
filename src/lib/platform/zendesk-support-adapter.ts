import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PlatformIntegrationConfigurationError, type NormalizedInboundEvent, type PlatformIntegrationAdapter } from "./integration-framework";

const ADAPTER_KEY = "zendesk.support";
const ALLOWED_OUTBOUND = new Set(["zendesk.ticket.create"]);

type JsonRecord = Record<string, unknown>;
type ZendeskCredential = { subdomain: string; email: string; apiToken: string; webhookSigningSecret: string };

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  return value as JsonRecord;
}
function text(value: unknown, label: string, max = 1000) {
  if (typeof value !== "string" || !value.trim()) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}
function parseCredential(value: string | null): ZendeskCredential {
  if (!value) throw new PlatformIntegrationConfigurationError("Zendesk credential bundle is required");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new PlatformIntegrationConfigurationError("Zendesk credential bundle is invalid JSON"); }
  const record = asRecord(parsed, "Zendesk credential bundle");
  const subdomain = text(record.subdomain, "Zendesk subdomain", 100).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(subdomain)) throw new PlatformIntegrationConfigurationError("Zendesk subdomain is invalid");
  const email = text(record.email, "Zendesk API user email", 320);
  if (!email.includes("@")) throw new PlatformIntegrationConfigurationError("Zendesk API user email is invalid");
  return {
    subdomain,
    email,
    apiToken: text(record.apiToken, "Zendesk API token", 4096),
    webhookSigningSecret: text(record.webhookSigningSecret, "Zendesk webhook signing secret", 4096),
  };
}
function validatePayload(payload: unknown): Prisma.InputJsonObject {
  const record = asRecord(payload, "Zendesk ticket payload");
  const allowed = new Set(["subject", "comment", "priority", "tags", "externalId"]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new PlatformIntegrationConfigurationError(`Zendesk ticket field ${key} is not allowed`);
  const subject = text(record.subject, "Zendesk ticket subject", 250);
  const comment = text(record.comment, "Zendesk ticket comment", 10000);
  const priority = record.priority == null ? undefined : text(record.priority, "Zendesk ticket priority", 20);
  if (priority && !["low", "normal", "high", "urgent"].includes(priority)) throw new PlatformIntegrationConfigurationError("Zendesk ticket priority is invalid");
  const tags = Array.isArray(record.tags) ? record.tags.map((item) => text(item, "Zendesk ticket tag", 100)).slice(0, 20) : undefined;
  const externalId = record.externalId == null ? undefined : text(record.externalId, "Zendesk external ID", 200);
  return {
    ticket: {
      subject,
      comment: { body: comment, public: false },
      ...(priority ? { priority } : {}),
      ...(tags ? { tags } : {}),
      ...(externalId ? { external_id: externalId } : {}),
    },
  } as Prisma.InputJsonObject;
}
function verifyWebhook(rawBody: string, headers: Headers, secret: string) {
  const signature = headers.get("x-zendesk-webhook-signature")?.trim() ?? "";
  const timestamp = headers.get("x-zendesk-webhook-signature-timestamp")?.trim() ?? "";
  if (!signature || !timestamp) throw new PlatformIntegrationConfigurationError("Zendesk webhook signature headers are missing");
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > 5 * 60 * 1000) throw new PlatformIntegrationConfigurationError("Zendesk webhook timestamp is outside the allowed replay window");
  const expected = createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PlatformIntegrationConfigurationError("Zendesk webhook signature is invalid");
}
function normalizeWebhook(rawBody: string): NormalizedInboundEvent {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { throw new PlatformIntegrationConfigurationError("Zendesk webhook body is invalid JSON"); }
  const record = asRecord(parsed, "Zendesk webhook body");
  const eventType = typeof record.type === "string" ? record.type.slice(0, 160) : "support.event";
  const providerEventId = typeof record.id === "string" ? record.id.slice(0, 240) : null;
  return { eventType: `zendesk.${eventType.replace(/[^a-zA-Z0-9_.-]/g, "_")}`, providerEventId, payload: record as Prisma.InputJsonObject };
}

export class ZendeskSupportAdapter implements PlatformIntegrationAdapter {
  readonly key = ADAPTER_KEY;

  async deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }): Promise<void> {
    if (!ALLOWED_OUTBOUND.has(input.eventType)) throw new PlatformIntegrationConfigurationError("Zendesk outbound event type is not allowed");
    const credential = parseCredential(input.credential);
    const payload = validatePayload(input.payload);
    const auth = Buffer.from(`${credential.email}/token:${credential.apiToken}`, "utf8").toString("base64");
    const response = await fetch(`https://${credential.subdomain}.zendesk.com/api/v2/tickets.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Trace-Idempotency-Key": input.idempotencyKey.slice(0, 200),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Zendesk request failed with HTTP ${response.status}`);
  }

  async verifyAndNormalizeWebhook(input: { rawBody: string; headers: Headers; configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    const credential = parseCredential(input.credential);
    verifyWebhook(input.rawBody, input.headers, credential.webhookSigningSecret);
    return normalizeWebhook(input.rawBody);
  }
}
