import { createHash } from "node:crypto";
import { PlatformIntegrationConfigurationError } from "./integration-framework";
import { validateSalesforceCdcTopic } from "./salesforce-cdc-subscriber-state";

const GLOBAL_ENDPOINT = "api.pubsub.salesforce.com:443";
const GERMANY_ENDPOINT = "api.deu.pubsub.salesforce.com:443";
const TENANT_ID_PATTERN = /^00D[A-Za-z0-9]{12,15}$/;

type JsonRecord = Record<string, unknown>;

export type SalesforcePubSubEndpointClass = "global" | "germany";

export type SalesforcePubSubRpcMetadata = {
  accesstoken: string;
  instanceurl: string;
  tenantid: string;
};

export type SalesforcePubSubTopicInfo = {
  topicName: string;
  tenantGuid: string;
  canPublish: boolean;
  canSubscribe: boolean;
  schemaId: string;
  rpcId: string | null;
};

export type SalesforcePubSubSchemaInfo = {
  schemaId: string;
  schemaJson: string;
  schemaSha256: string;
  rpcId: string | null;
};

export interface SalesforcePubSubDiscoveryTransport {
  getTopic(input: {
    endpoint: string;
    metadata: SalesforcePubSubRpcMetadata;
    topicName: string;
  }): Promise<{
    topic_name: string;
    tenant_guid: string;
    can_publish: boolean;
    can_subscribe: boolean;
    schema_id: string;
    rpc_id?: string | null;
  }>;

  getSchema(input: {
    endpoint: string;
    metadata: SalesforcePubSubRpcMetadata;
    schemaId: string;
  }): Promise<{
    schema_id: string;
    schema_json: string;
    rpc_id?: string | null;
  }>;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PlatformIntegrationConfigurationError(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  }
  return normalized;
}

function approvedInstanceOrigin(value: unknown) {
  const raw = requiredText(value, "Salesforce instance URL", 512);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PlatformIntegrationConfigurationError("Salesforce instance URL is invalid");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new PlatformIntegrationConfigurationError("Salesforce instance URL must be a bare HTTPS origin");
  }
  if (!(hostname.endsWith(".my.salesforce.com") || hostname.endsWith(".salesforce.com"))) {
    throw new PlatformIntegrationConfigurationError("Salesforce instance URL host is not allowed");
  }
  return url.origin;
}

export function parseSalesforcePubSubCredential(credential: string | null): SalesforcePubSubRpcMetadata {
  if (!credential) throw new PlatformIntegrationConfigurationError("Salesforce credential bundle is required");
  let parsed: unknown;
  try {
    parsed = JSON.parse(credential);
  } catch {
    throw new PlatformIntegrationConfigurationError("Salesforce credential bundle is invalid JSON");
  }
  const value = record(parsed, "Salesforce credential bundle");
  const accessToken = requiredText(value.accessToken, "Salesforce access token", 4096);
  const instanceUrl = approvedInstanceOrigin(value.instanceUrl);
  const tenantId = requiredText(value.tenantId, "Salesforce tenant/org ID", 32);
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new PlatformIntegrationConfigurationError("Salesforce tenant/org ID is invalid");
  }
  return {
    accesstoken: accessToken,
    instanceurl: instanceUrl,
    tenantid: tenantId,
  };
}

export function salesforcePubSubEndpoint(endpointClass: SalesforcePubSubEndpointClass) {
  if (endpointClass === "global") return GLOBAL_ENDPOINT;
  if (endpointClass === "germany") return GERMANY_ENDPOINT;
  throw new PlatformIntegrationConfigurationError("Salesforce Pub/Sub endpoint class is invalid");
}

function validateSchemaJson(schemaJson: string) {
  const bounded = requiredText(schemaJson, "Salesforce Avro schema JSON", 2_000_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bounded);
  } catch {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema JSON is invalid");
  }
  const root = record(parsed, "Salesforce Avro schema");
  if (root.type !== "record" || typeof root.name !== "string" || !Array.isArray(root.fields)) {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema is not a record schema");
  }
  return bounded;
}

export class SalesforcePubSubDiscoveryService {
  constructor(private readonly transport: SalesforcePubSubDiscoveryTransport) {}

  async discover(input: {
    credential: string | null;
    topic: string;
    endpointClass?: SalesforcePubSubEndpointClass;
  }): Promise<{
    endpoint: string;
    topic: SalesforcePubSubTopicInfo;
    schema: SalesforcePubSubSchemaInfo;
  }> {
    const metadata = parseSalesforcePubSubCredential(input.credential);
    const topicName = validateSalesforceCdcTopic(input.topic);
    const endpoint = salesforcePubSubEndpoint(input.endpointClass ?? "global");

    const rawTopic = await this.transport.getTopic({ endpoint, metadata, topicName });
    const returnedTopic = requiredText(rawTopic.topic_name, "Salesforce returned topic", 240);
    if (returnedTopic !== topicName) {
      throw new PlatformIntegrationConfigurationError("Salesforce returned topic does not match the requested topic");
    }
    if (!rawTopic.can_subscribe) {
      throw new PlatformIntegrationConfigurationError("Salesforce topic is not subscribable");
    }
    const schemaId = requiredText(rawTopic.schema_id, "Salesforce schema ID", 240);
    const tenantGuid = requiredText(rawTopic.tenant_guid, "Salesforce tenant GUID", 240);

    const rawSchema = await this.transport.getSchema({ endpoint, metadata, schemaId });
    const returnedSchemaId = requiredText(rawSchema.schema_id, "Salesforce returned schema ID", 240);
    if (returnedSchemaId !== schemaId) {
      throw new PlatformIntegrationConfigurationError("Salesforce returned schema ID does not match the topic schema");
    }
    const schemaJson = validateSchemaJson(rawSchema.schema_json);

    return {
      endpoint,
      topic: {
        topicName,
        tenantGuid,
        canPublish: Boolean(rawTopic.can_publish),
        canSubscribe: true,
        schemaId,
        rpcId: typeof rawTopic.rpc_id === "string" && rawTopic.rpc_id ? rawTopic.rpc_id.slice(0, 240) : null,
      },
      schema: {
        schemaId,
        schemaJson,
        schemaSha256: createHash("sha256").update(schemaJson, "utf8").digest("hex"),
        rpcId: typeof rawSchema.rpc_id === "string" && rawSchema.rpc_id ? rawSchema.rpc_id.slice(0, 240) : null,
      },
    };
  }
}
