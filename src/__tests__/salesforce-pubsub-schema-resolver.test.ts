import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SalesforcePubSubSchemaResolver } from "@/lib/platform/salesforce-pubsub-schema-resolver";

const metadata = {
  accesstoken: "synthetic-access-token",
  instanceurl: "https://example.my.salesforce.com",
  tenantid: "00D000000000001AAA",
};

function schemaJson() {
  return JSON.stringify({
    type: "record",
    name: "AccountChangeEvent",
    fields: [],
  });
}

describe("Salesforce event-schema resolver", () => {
  it("resolves the exact event schema through the reviewed GetSchema boundary", async () => {
    const json = schemaJson();
    const transport = {
      getTopic: vi.fn(),
      getSchema: vi.fn(async () => ({
        schema_id: "schema-001",
        schema_json: json,
        rpc_id: "rpc-schema-001",
      })),
    };
    const resolver = new SalesforcePubSubSchemaResolver(transport);

    const result = await resolver.resolve({
      metadata,
      schemaId: "schema-001",
    });

    expect(transport.getSchema).toHaveBeenCalledWith({
      endpoint: "api.pubsub.salesforce.com:443",
      metadata,
      schemaId: "schema-001",
    });
    expect(transport.getTopic).not.toHaveBeenCalled();
    expect(result).toEqual({
      schemaId: "schema-001",
      schemaJson: json,
      schemaSha256: createHash("sha256").update(json, "utf8").digest("hex"),
      rpcId: "rpc-schema-001",
    });
  });

  it("fails closed if Salesforce returns a different schema ID", async () => {
    const transport = {
      getTopic: vi.fn(),
      getSchema: vi.fn(async () => ({
        schema_id: "schema-other",
        schema_json: schemaJson(),
        rpc_id: null,
      })),
    };

    await expect(new SalesforcePubSubSchemaResolver(transport).resolve({
      metadata,
      schemaId: "schema-001",
    })).rejects.toThrow("does not match the requested event schema");
  });

  it("rejects malformed or non-record schema JSON", async () => {
    for (const schema_json of [
      "not-json",
      JSON.stringify({ type: "string" }),
    ]) {
      const transport = {
        getTopic: vi.fn(),
        getSchema: vi.fn(async () => ({
          schema_id: "schema-001",
          schema_json,
          rpc_id: null,
        })),
      };

      await expect(new SalesforcePubSubSchemaResolver(transport).resolve({
        metadata,
        schemaId: "schema-001",
      })).rejects.toThrow();
    }
  });
});
