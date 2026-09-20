import { createHash } from "node:crypto";
import { PlatformIntegrationConfigurationError } from "./integration-framework";
import {
  salesforcePubSubEndpoint,
  type SalesforcePubSubDiscoveryTransport,
  type SalesforcePubSubRpcMetadata,
  type SalesforcePubSubSchemaInfo,
} from "./salesforce-pubsub-discovery";
import { NodeHttp2SalesforcePubSubDiscoveryTransport } from "./salesforce-pubsub-grpc-discovery-transport";

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

function validateSchemaJson(schemaJson: string) {
  const bounded = requiredText(schemaJson, "Salesforce Avro schema JSON", 2_000_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bounded);
  } catch {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema JSON is invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema must be an object");
  }
  const root = parsed as Record<string, unknown>;
  if (root.type !== "record" || typeof root.name !== "string" || !Array.isArray(root.fields)) {
    throw new PlatformIntegrationConfigurationError("Salesforce Avro schema is not a record schema");
  }
  return bounded;
}

export class SalesforcePubSubSchemaResolver {
  constructor(
    private readonly transport: SalesforcePubSubDiscoveryTransport =
      new NodeHttp2SalesforcePubSubDiscoveryTransport(),
  ) {}

  async resolve(input: {
    metadata: SalesforcePubSubRpcMetadata;
    schemaId: string;
  }): Promise<SalesforcePubSubSchemaInfo> {
    const requestedSchemaId = requiredText(input.schemaId, "Salesforce schema ID", 240);
    const raw = await this.transport.getSchema({
      endpoint: salesforcePubSubEndpoint("global"),
      metadata: input.metadata,
      schemaId: requestedSchemaId,
    });

    const returnedSchemaId = requiredText(raw.schema_id, "Salesforce returned schema ID", 240);
    if (returnedSchemaId !== requestedSchemaId) {
      throw new PlatformIntegrationConfigurationError(
        "Salesforce returned schema ID does not match the requested event schema",
      );
    }

    const schemaJson = validateSchemaJson(raw.schema_json);
    return {
      schemaId: returnedSchemaId,
      schemaJson,
      schemaSha256: createHash("sha256").update(schemaJson, "utf8").digest("hex"),
      rpcId:
        typeof raw.rpc_id === "string" && raw.rpc_id
          ? raw.rpc_id.slice(0, 240)
          : null,
    };
  }
}
