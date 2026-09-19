import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationDeliveryRejectedError,
  type NormalizedInboundEvent,
  type PlatformIntegrationAdapter,
  type PlatformIntegrationWebhookEvidence,
} from "./integration-framework";

const ADAPTER_KEY = "quickbooks.accounting";
const DEFAULT_MINOR_VERSION = 75;
const ALLOWED_OUTBOUND = new Set([
  "quickbooks.customer.create",
  "quickbooks.invoice.create",
  "quickbooks.payment.create",
]);
const ALLOWED_ENTITIES = new Set(["Customer", "Invoice", "Payment", "CreditMemo", "Estimate"]);
const ALLOWED_OPERATIONS = new Set(["Create", "Update", "Delete", "Void", "Merge"]);

type JsonRecord = Record<string, unknown>;

type QuickBooksCredential = { accessToken: string; realmId: string; webhookVerifierToken: string };
type QuickBooksConfiguration = { environment: "sandbox" | "production"; minorVersion: number };

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  return value as JsonRecord;
}

function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

function parseCredential(value: string | null): QuickBooksCredential {
  if (!value) throw new PlatformIntegrationConfigurationError("QuickBooks credential bundle is required");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new PlatformIntegrationConfigurationError("QuickBooks credential bundle is invalid JSON"); }
  const record = asRecord(parsed, "QuickBooks credential bundle");
  const realmId = text(record.realmId, "QuickBooks realm ID", 64);
  if (!/^\d{1,64}$/.test(realmId)) throw new PlatformIntegrationConfigurationError("QuickBooks realm ID is invalid");
  return {
    accessToken: text(record.accessToken, "QuickBooks access token", 4096),
    realmId,
    webhookVerifierToken: text(record.webhookVerifierToken, "QuickBooks webhook verifier token", 1024),
  };
}

function parseConfiguration(value: unknown): QuickBooksConfiguration {
  const record = asRecord(value ?? {}, "QuickBooks configuration");
  const environment = record.environment === "production" ? "production" : record.environment === "sandbox" || record.environment == null ? "sandbox" : null;
  if (!environment) throw new PlatformIntegrationConfigurationError("QuickBooks environment must be sandbox or production");
  const requestedMinor = record.minorVersion == null ? DEFAULT_MINOR_VERSION : Number(record.minorVersion);
  if (!Number.isInteger(requestedMinor) || requestedMinor < 1 || requestedMinor > 200) throw new PlatformIntegrationConfigurationError("QuickBooks minor version is invalid");
  return { environment, minorVersion: requestedMinor };
}

function endpoint(configuration: QuickBooksConfiguration, realmId: string, entity: string) {
  const host = configuration.environment === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
  return `${host}/v3/company/${encodeURIComponent(realmId)}/${entity}?minorversion=${configuration.minorVersion}`;
}

function outboundEntity(eventType: string) {
  if (eventType === "quickbooks.customer.create") return { path: "customer", objectKey: "Customer" };
  if (eventType === "quickbooks.invoice.create") return { path: "invoice", objectKey: "Invoice" };
  if (eventType === "quickbooks.payment.create") return { path: "payment", objectKey: "Payment" };
  throw new PlatformIntegrationConfigurationError("QuickBooks outbound event type is not allowed");
}

function validateOutboundPayload(eventType: string, payload: unknown): Prisma.InputJsonObject {
  if (!ALLOWED_OUTBOUND.has(eventType)) throw new PlatformIntegrationConfigurationError("QuickBooks outbound event type is not allowed");
  const record = asRecord(payload, "QuickBooks outbound payload");
  const serialized = JSON.stringify(record);
  if (serialized.length > 100_000) throw new PlatformIntegrationConfigurationError("QuickBooks outbound payload is too large");
  if ("Id" in record || "SyncToken" in record) throw new PlatformIntegrationConfigurationError("QuickBooks create payload cannot supply Id or SyncToken");
  return record as Prisma.InputJsonObject;
}

function verifySignature(rawBodyBytes: Uint8Array, signature: string | null, verifierToken: string) {
  if (!signature) throw new PlatformIntegrationConfigurationError("QuickBooks webhook signature is missing");
  const expected = createHmac("sha256", verifierToken).update(rawBodyBytes).digest("base64");
  const supplied = signature.trim();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PlatformIntegrationConfigurationError("QuickBooks webhook signature is invalid");
}

function normalizeWebhook(rawBody: string, expectedRealmId: string): NormalizedInboundEvent {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { throw new PlatformIntegrationConfigurationError("QuickBooks webhook body is invalid JSON"); }
  const root = asRecord(parsed, "QuickBooks webhook body");
  const notifications = Array.isArray(root.eventNotifications) ? root.eventNotifications : [];
  const normalized: Prisma.InputJsonObject[] = [];
  for (const notificationValue of notifications.slice(0, 25)) {
    const notification = asRecord(notificationValue, "QuickBooks event notification");
    const realmId = text(notification.realmId, "QuickBooks webhook realm ID", 64);
    if (realmId !== expectedRealmId) throw new PlatformIntegrationConfigurationError("QuickBooks webhook realm does not match the configured company");
    const change = asRecord(notification.dataChangeEvent ?? {}, "QuickBooks data change event");
    const entities = Array.isArray(change.entities) ? change.entities : [];
    for (const entityValue of entities.slice(0, 100)) {
      const entity = asRecord(entityValue, "QuickBooks changed entity");
      const name = text(entity.name, "QuickBooks entity name", 80);
      const operation = text(entity.operation, "QuickBooks operation", 40);
      if (!ALLOWED_ENTITIES.has(name) || !ALLOWED_OPERATIONS.has(operation)) continue;
      normalized.push({ realmId, name, id: text(entity.id, "QuickBooks entity ID", 100), operation, lastUpdated: typeof entity.lastUpdated === "string" ? entity.lastUpdated.slice(0, 80) : null });
    }
  }
  if (normalized.length === 0) throw new PlatformIntegrationConfigurationError("QuickBooks webhook contains no supported accounting changes");
  return { eventType: "quickbooks.accounting.data_change", payload: { changes: normalized } };
}

export class QuickBooksAccountingAdapter implements PlatformIntegrationAdapter {
  readonly key = ADAPTER_KEY;

  async deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }) {
    const credential = parseCredential(input.credential);
    const configuration = parseConfiguration(input.configuration);
    const payload = validateOutboundPayload(input.eventType, input.payload);
    const entity = outboundEntity(input.eventType);
    const response = await fetch(endpoint(configuration, credential.realmId, entity.path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Request-Id": input.idempotencyKey.slice(0, 50),
      },
      body: JSON.stringify(payload),
    });
    const requestId = response.headers.get("intuit_tid")?.slice(0, 500) ?? null;
    if (!response.ok) {
      if (response.status === 429) throw new PlatformIntegrationDeliveryRejectedError("QuickBooks request was rate limited", true, { providerRequestId: requestId });
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        throw new PlatformIntegrationDeliveryRejectedError(`QuickBooks request was rejected with HTTP ${response.status}`, false, { providerRequestId: requestId });
      }
      throw new Error(`QuickBooks provider outcome is ambiguous after HTTP ${response.status}${requestId ? ` (${requestId})` : ""}`);
    }
    const responseBody = await response.json() as Record<string, unknown>;
    const created = responseBody[entity.objectKey];
    const createdRecord = created && typeof created === "object" && !Array.isArray(created) ? created as Record<string, unknown> : {};
    const providerObjectId = typeof createdRecord.Id === "string" ? createdRecord.Id.slice(0, 500) : null;
    return { providerRequestId: requestId, providerObjectId, providerOutcome: "QUICKBOOKS_CONFIRMED_CREATED" };
  }

  async verifyAndNormalizeWebhook(input: PlatformIntegrationWebhookEvidence & { configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    const credential = parseCredential(input.credential);
    parseConfiguration(input.configuration);
    verifySignature(input.rawBodyBytes, input.headers.get("intuit-signature"), credential.webhookVerifierToken);
    return normalizeWebhook(input.rawBody, credential.realmId);
  }
}
