import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  salesforcePubSubDiscoveryRpcPaths,
  salesforcePubSubGrpcCodec,
} from "@/lib/platform/salesforce-pubsub-grpc-discovery-transport";

function varint(value: number) {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
}

function fieldString(fieldNumber: number, value: string) {
  const payload = Buffer.from(value, "utf8");
  return Buffer.concat([
    varint((fieldNumber << 3) | 2),
    varint(payload.length),
    payload,
  ]);
}

function fieldBool(fieldNumber: number, value: boolean) {
  return Buffer.from([(fieldNumber << 3) | 0, value ? 1 : 0]);
}

const source = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-pubsub-grpc-discovery-transport.ts"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);

describe("Salesforce Pub/Sub unary gRPC discovery transport", () => {
  it("hard-codes only GetTopic and GetSchema service paths", () => {
    expect(salesforcePubSubDiscoveryRpcPaths).toEqual({
      getTopic: "/eventbus.v1.PubSub/GetTopic",
      getSchema: "/eventbus.v1.PubSub/GetSchema",
    });
    expect(Object.values(salesforcePubSubDiscoveryRpcPaths)).not.toContain(
      "/eventbus.v1.PubSub/Subscribe",
    );
    expect(source).not.toContain('"/eventbus.v1.PubSub/Publish"');
    expect(source).not.toContain('"/eventbus.v1.PubSub/ManagedSubscribe"');
  });

  it("encodes the unary request message with the Salesforce proto field number", () => {
    const encoded = salesforcePubSubGrpcCodec.encodeStringField(
      1,
      "/data/AccountChangeEvent",
    );
    expect(encoded).toEqual(fieldString(1, "/data/AccountChangeEvent"));

    const framed = salesforcePubSubGrpcCodec.encodeGrpcFrame(encoded);
    expect(framed[0]).toBe(0);
    expect(framed.readUInt32BE(1)).toBe(encoded.length);
    expect(framed.subarray(5)).toEqual(encoded);
  });

  it("decodes TopicInfo according to the reviewed Salesforce proto", () => {
    const message = Buffer.concat([
      fieldString(1, "/data/AccountChangeEvent"),
      fieldString(2, "tenant-guid-001"),
      fieldBool(3, false),
      fieldBool(4, true),
      fieldString(5, "schema-001"),
      fieldString(6, "rpc-topic-001"),
    ]);

    expect(salesforcePubSubGrpcCodec.decodeTopicInfo(message)).toEqual({
      topic_name: "/data/AccountChangeEvent",
      tenant_guid: "tenant-guid-001",
      can_publish: false,
      can_subscribe: true,
      schema_id: "schema-001",
      rpc_id: "rpc-topic-001",
    });
  });

  it("decodes SchemaInfo and the enclosing uncompressed gRPC frame", () => {
    const schema = JSON.stringify({
      type: "record",
      name: "AccountChangeEvent",
      fields: [],
    });
    const message = Buffer.concat([
      fieldString(1, schema),
      fieldString(2, "schema-001"),
      fieldString(3, "rpc-schema-001"),
    ]);
    const frame = salesforcePubSubGrpcCodec.encodeGrpcFrame(message);
    const unframed = salesforcePubSubGrpcCodec.decodeGrpcUnaryResponse(frame);

    expect(unframed).toEqual(message);
    expect(salesforcePubSubGrpcCodec.decodeSchemaInfo(unframed)).toEqual({
      schema_json: schema,
      schema_id: "schema-001",
      rpc_id: "rpc-schema-001",
    });
  });

  it("rejects compressed, truncated, and multi-frame-like unary responses", () => {
    const message = fieldString(1, "schema");
    const compressed = salesforcePubSubGrpcCodec.encodeGrpcFrame(message);
    compressed[0] = 1;
    expect(() => salesforcePubSubGrpcCodec.decodeGrpcUnaryResponse(compressed))
      .toThrow("Compressed Salesforce gRPC responses are not supported");

    const truncated = salesforcePubSubGrpcCodec.encodeGrpcFrame(message).subarray(0, 6);
    expect(() => salesforcePubSubGrpcCodec.decodeGrpcUnaryResponse(truncated))
      .toThrow("response length is invalid");

    const valid = salesforcePubSubGrpcCodec.encodeGrpcFrame(message);
    const twoFrames = Buffer.concat([valid, valid]);
    expect(() => salesforcePubSubGrpcCodec.decodeGrpcUnaryResponse(twoFrames))
      .toThrow("response length is invalid");
  });

  it("uses TLS HTTP/2, required metadata, timeout and response bounds", () => {
    expect(source).toContain('connect(AUTHORITY)');
    expect(source).toContain('const AUTHORITY = "https://api.pubsub.salesforce.com"');
    expect(source).toContain('"application/grpc"');
    expect(source).toContain('"grpc-timeout": "10S"');
    expect(source).toContain("accesstoken: input.metadata.accesstoken");
    expect(source).toContain("instanceurl: input.metadata.instanceurl");
    expect(source).toContain("tenantid: input.metadata.tenantid");
    expect(source).toContain("MAX_RESPONSE_BYTES");
    expect(source).toContain('finalStatus !== "0"');
  });

  it("is still not composed into the application runtime", () => {
    expect(runtime).not.toContain("NodeHttp2SalesforcePubSubDiscoveryTransport");
    expect(runtime).not.toContain("salesforce-pubsub-grpc-discovery-transport");
  });
});
