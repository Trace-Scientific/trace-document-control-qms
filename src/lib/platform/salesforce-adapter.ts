import { Prisma } from "@prisma/client";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationDeliveryRejectedError,
  type NormalizedInboundEvent,
  type PlatformIntegrationAdapter,
} from "./integration-framework";

const ADAPTER_KEY = "salesforce.crm";
const ALLOWED_OUTBOUND = new Set([
  "salesforce.account.create",
  "salesforce.contact.create",
  "salesforce.opportunity.create",
]);

type JsonRecord = Record<string, unknown>;
type SalesforceCredential = { accessToken: string; instanceUrl: string };
type SalesforceConfiguration = { apiVersion: string };

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  return value as JsonRecord;
}

function text(value: unknown, label: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim()) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

function parseCredential(value: string | null): SalesforceCredential {
  if (!value) throw new PlatformIntegrationConfigurationError("Salesforce credential bundle is required");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new PlatformIntegrationConfigurationError("Salesforce credential bundle is invalid JSON"); }
  const record = asRecord(parsed, "Salesforce credential bundle");
  const instanceUrl = text(record.instanceUrl, "Salesforce instance URL", 512);
  let url: URL;
  try { url = new URL(instanceUrl); } catch { throw new PlatformIntegrationConfigurationError("Salesforce instance URL is invalid"); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new PlatformIntegrationConfigurationError("Salesforce instance URL must be a bare HTTPS origin");
  }
  if (!(hostname.endsWith(".my.salesforce.com") || hostname.endsWith(".salesforce.com"))) {
    throw new PlatformIntegrationConfigurationError("Salesforce instance URL host is not allowed");
  }
  return { accessToken: text(record.accessToken, "Salesforce access token"), instanceUrl: url.origin };
}

function parseConfiguration(value: unknown): SalesforceConfiguration {
  const record = asRecord(value ?? {}, "Salesforce configuration");
  const requested = record.apiVersion == null ? "latest" : text(record.apiVersion, "Salesforce API version", 20);
  if (requested !== "latest" && !/^v?\d{2}\.0$/.test(requested)) throw new PlatformIntegrationConfigurationError("Salesforce API version is invalid");
  return { apiVersion: requested === "latest" ? "latest" : requested.startsWith("v") ? requested.slice(1) : requested };
}

function objectFor(eventType: string) {
  if (eventType === "salesforce.account.create") return "Account";
  if (eventType === "salesforce.contact.create") return "Contact";
  if (eventType === "salesforce.opportunity.create") return "Opportunity";
  throw new PlatformIntegrationConfigurationError("Salesforce outbound event type is not allowed");
}

function validatePayload(eventType: string, payload: unknown): Prisma.InputJsonObject {
  if (!ALLOWED_OUTBOUND.has(eventType)) throw new PlatformIntegrationConfigurationError("Salesforce outbound event type is not allowed");
  const record = asRecord(payload, "Salesforce outbound payload");
  if (JSON.stringify(record).length > 100_000) throw new PlatformIntegrationConfigurationError("Salesforce outbound payload is too large");
  if ("Id" in record || "attributes" in record) throw new PlatformIntegrationConfigurationError("Salesforce create payload cannot supply Id or attributes");
  return record as Prisma.InputJsonObject;
}

function endpoint(credential: SalesforceCredential, configuration: SalesforceConfiguration, objectName: string) {
  const version = configuration.apiVersion === "latest" ? "latest" : `v${configuration.apiVersion}`;
  return `${credential.instanceUrl}/services/data/${version}/sobjects/${objectName}/`;
}

export class SalesforceCrmAdapter implements PlatformIntegrationAdapter {
  readonly key = ADAPTER_KEY;

  async deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }) {
    const credential = parseCredential(input.credential);
    const configuration = parseConfiguration(input.configuration);
    const payload = validatePayload(input.eventType, input.payload);
    const response = await fetch(endpoint(credential, configuration, objectFor(input.eventType)), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Sforce-Call-Options": "client=TraceScientific;defaultNamespace=",
        "X-Trace-Delivery-Key": input.idempotencyKey.slice(0, 200),
      },
      body: JSON.stringify(payload),
    });
    const requestId = response.headers.get("sforce-limit-info")?.slice(0, 500) ?? null;
    if (!response.ok) {
      if (response.status === 429) throw new PlatformIntegrationDeliveryRejectedError("Salesforce request was rate limited", true, { providerRequestId: requestId });
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        throw new PlatformIntegrationDeliveryRejectedError(`Salesforce request was rejected with HTTP ${response.status}`, false, { providerRequestId: requestId });
      }
      throw new Error(`Salesforce provider outcome is ambiguous after HTTP ${response.status}`);
    }
    const body = await response.json() as Record<string, unknown>;
    const providerObjectId = typeof body.id === "string" ? body.id.slice(0, 500) : null;
    return { providerRequestId: requestId, providerObjectId, providerOutcome: "SALESFORCE_CONFIRMED_CREATED" };
  }

  async verifyAndNormalizeWebhook(_input: { rawBody: string; headers: Headers; configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    throw new PlatformIntegrationConfigurationError("Salesforce inbound CRM synchronization requires a reviewed Pub/Sub API subscriber and is not enabled in this release");
  }
}
