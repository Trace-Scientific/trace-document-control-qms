import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SalesforcePubSubDiscoveryService,
  parseSalesforcePubSubCredential,
  salesforcePubSubEndpoint,
  type SalesforcePubSubDiscoveryTransport,
} from "@/lib/platform/salesforce-pubsub-discovery";

const credential = JSON.stringify({
  accessToken: "synthetic-salesforce-access-token",
  instanceUrl: "https://example.my.salesforce.com",
  tenantId: "00D000000000001AAA",
});

const runtime = readFileSync(join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");

describe("Salesforce Pub/Sub discovery boundary", () => {
  it("builds only the reviewed Salesforce RPC authentication metadata", () => {
    expect(parseSalesforcePubSubCredential(credential)).toEqual({
      accesstoken: "synthetic-salesforce-access-token",
      instanceurl: "https://example.my.salesforce.com",
      tenantid: "00D000000000001AAA",
    });
  });

  it("rejects malformed tenant IDs and unapproved instance origins", () => {
    expect(() => parseSalesforcePubSubCredential(JSON.stringify({
      accessToken: "token",
      instanceUrl: "https://example.my.salesforce.com/path",
      tenantId: "00D000000000001AAA",
    }))).toThrow("bare HTTPS origin");

    expect(() => parseSalesforcePubSubCredential(JSON.stringify({
      accessToken: "token",
      instanceUrl: "https://example.my.salesforce.com",
      tenantId: "not-an-org-id",
    }))).toThrow("tenant/org ID is invalid");
  });

  it("uses only the reviewed fixed global Pub/Sub endpoint", () => {
    expect(salesforcePubSubEndpoint("global")).toBe("api.pubsub.salesforce.com:443");
  });

  it("discovers a subscribable topic then validates the matching schema", async () => {
    const calls: string[] = [];
    const transport: SalesforcePubSubDiscoveryTransport = {
      async getTopic(input) {
        calls.push(`topic:${input.endpoint}:${input.topicName}:${input.metadata.tenantid}`);
        return {
          topic_name: input.topicName,
          tenant_guid: "tenant-guid-001",
          can_publish: false,
          can_subscribe: true,
          schema_id: "schema-001",
          rpc_id: "rpc-topic-001",
        };
      },
      async getSchema(input) {
        calls.push(`schema:${input.endpoint}:${input.schemaId}:${input.metadata.instanceurl}`);
        return {
          schema_id: input.schemaId,
          schema_json: JSON.stringify({
            type: "record",
            name: "AccountChangeEvent",
            fields: [{ name: "ChangeEventHeader", type: { type: "record", name: "ChangeEventHeader", fields: [] } }],
          }),
          rpc_id: "rpc-schema-001",
        };
      },
    };

    const result = await new SalesforcePubSubDiscoveryService(transport).discover({
      credential,
      topic: "/data/AccountChangeEvent",
    });

    expect(calls).toEqual([
      "topic:api.pubsub.salesforce.com:443:/data/AccountChangeEvent:00D000000000001AAA",
      "schema:api.pubsub.salesforce.com:443:schema-001:https://example.my.salesforce.com",
    ]);
    expect(result.topic).toEqual({
      topicName: "/data/AccountChangeEvent",
      tenantGuid: "tenant-guid-001",
      canPublish: false,
      canSubscribe: true,
      schemaId: "schema-001",
      rpcId: "rpc-topic-001",
    });
    expect(result.schema.schemaId).toBe("schema-001");
    expect(result.schema.schemaSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.schema.rpcId).toBe("rpc-schema-001");
  });

  it("fails closed on unsubscribable topics, schema mismatches, and invalid Avro schema JSON", async () => {
    const base: SalesforcePubSubDiscoveryTransport = {
      async getTopic(input) {
        return {
          topic_name: input.topicName,
          tenant_guid: "tenant-guid-001",
          can_publish: false,
          can_subscribe: true,
          schema_id: "schema-001",
        };
      },
      async getSchema(input) {
        return {
          schema_id: input.schemaId,
          schema_json: JSON.stringify({ type: "record", name: "Change", fields: [] }),
        };
      },
    };

    await expect(new SalesforcePubSubDiscoveryService({
      ...base,
      async getTopic(input) {
        return { ...(await base.getTopic(input)), can_subscribe: false };
      },
    }).discover({ credential, topic: "/data/ChangeEvents" })).rejects.toThrow("not subscribable");

    await expect(new SalesforcePubSubDiscoveryService({
      ...base,
      async getSchema() {
        return { schema_id: "different-schema", schema_json: JSON.stringify({ type: "record", name: "Change", fields: [] }) };
      },
    }).discover({ credential, topic: "/data/ChangeEvents" })).rejects.toThrow("schema ID does not match");

    await expect(new SalesforcePubSubDiscoveryService({
      ...base,
      async getSchema(input) {
        return { schema_id: input.schemaId, schema_json: JSON.stringify({ type: "string" }) };
      },
    }).discover({ credential, topic: "/data/ChangeEvents" })).rejects.toThrow("not a record schema");
  });

  it("does not expose or compose a Subscribe stream in this slice", async () => {
    const discoveryModule = await import("@/lib/platform/salesforce-pubsub-discovery");
    expect("SalesforcePubSubSubscriber" in discoveryModule).toBe(false);
    expect("subscribe" in SalesforcePubSubDiscoveryService.prototype).toBe(false);
    expect(runtime).not.toContain("SalesforcePubSubDiscoveryService");
    expect(runtime).not.toContain("salesforce-pubsub-discovery");
  });
});
