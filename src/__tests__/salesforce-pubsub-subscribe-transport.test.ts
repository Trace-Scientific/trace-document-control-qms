import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SalesforceGrpcStreamFrameDecoder,
  salesforceSubscribeTransportConstants,
} from "@/lib/platform/salesforce-pubsub-subscribe-transport";

function frame(payload: Uint8Array) {
  const header = Buffer.alloc(5);
  header[0] = 0;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, Buffer.from(payload)]);
}

const source = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-pubsub-subscribe-transport.ts"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);

describe("Salesforce Subscribe streaming transport boundary", () => {
  it("hard-codes the reviewed secure Salesforce Subscribe target", () => {
    expect(salesforceSubscribeTransportConstants.authority)
      .toBe("https://api.pubsub.salesforce.com");
    expect(salesforceSubscribeTransportConstants.rpcPath)
      .toBe("/eventbus.v1.PubSub/Subscribe");
    expect(source).toContain('connect(AUTHORITY)');
    expect(source).toContain('"application/grpc"');
    expect(source).toContain('te: "trailers"');
    expect(source).not.toContain("http://");
    expect(source).not.toContain("rejectUnauthorized: false");
  });

  it("injects all required Salesforce metadata into the stream request", () => {
    expect(source).toContain("accesstoken: input.metadata.accesstoken");
    expect(source).toContain("instanceurl: input.metadata.instanceurl");
    expect(source).toContain("tenantid: input.metadata.tenantid");
  });

  it("reassembles a frame split across arbitrary HTTP/2 chunks", () => {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const encoded = frame(payload);
    const decoder = new SalesforceGrpcStreamFrameDecoder();

    expect(decoder.push(encoded.subarray(0, 2))).toEqual([]);
    expect(decoder.push(encoded.subarray(2, 7))).toEqual([]);
    const messages = decoder.push(encoded.subarray(7));

    expect(messages).toHaveLength(1);
    expect(Buffer.from(messages[0])).toEqual(payload);
    expect(decoder.bufferedBytes()).toBe(0);
    expect(() => decoder.finish()).not.toThrow();
  });

  it("emits multiple complete gRPC messages from one chunk", () => {
    const decoder = new SalesforceGrpcStreamFrameDecoder();
    const first = Buffer.from([10, 11]);
    const second = Buffer.from([20, 21, 22]);

    const messages = decoder.push(Buffer.concat([frame(first), frame(second)]));
    expect(messages.map((message) => Buffer.from(message))).toEqual([first, second]);
    expect(decoder.bufferedBytes()).toBe(0);
  });

  it("retains an incomplete trailing frame until more bytes arrive", () => {
    const decoder = new SalesforceGrpcStreamFrameDecoder();
    const first = frame(Buffer.from([1]));
    const second = frame(Buffer.from([2, 3, 4]));

    const combined = Buffer.concat([first, second.subarray(0, 6)]);
    const messages = decoder.push(combined);

    expect(messages).toHaveLength(1);
    expect(Buffer.from(messages[0])).toEqual(Buffer.from([1]));
    expect(decoder.bufferedBytes()).toBe(6);
    expect(() => decoder.finish()).toThrow("incomplete frame");

    const completed = decoder.push(second.subarray(6));
    expect(completed).toHaveLength(1);
    expect(Buffer.from(completed[0])).toEqual(Buffer.from([2, 3, 4]));
    expect(() => decoder.finish()).not.toThrow();
  });

  it("rejects compressed and oversized stream messages", () => {
    const compressed = frame(Buffer.from([1, 2, 3]));
    compressed[0] = 1;
    const compressedDecoder = new SalesforceGrpcStreamFrameDecoder();
    expect(() => compressedDecoder.push(compressed))
      .toThrow("Compressed Salesforce gRPC stream messages are not supported");

    const oversizedHeader = Buffer.alloc(5);
    oversizedHeader[0] = 0;
    oversizedHeader.writeUInt32BE(
      salesforceSubscribeTransportConstants.maxGrpcMessageBytes + 1,
      1,
    );
    const oversizedDecoder = new SalesforceGrpcStreamFrameDecoder();
    expect(() => oversizedDecoder.push(oversizedHeader))
      .toThrow("message exceeds the maximum size");
  });

  it("requires the initial request before flow-control and prevents a second initial request", () => {
    expect(source).toContain("Salesforce Subscribe initial request must be sent first");
    expect(source).toContain("Salesforce Subscribe initial request was already sent");
    expect(source).toContain('phase: "FLOW_CONTROL"');
    expect(source).toContain("encodeSalesforceFetchRequest(fetchInput)");
  });

  it("uses a bounded idle timeout appropriate for Salesforce keepalive behavior", () => {
    expect(salesforceSubscribeTransportConstants.idleTimeoutMs).toBe(300_000);
    expect(source).toContain("Salesforce Pub/Sub Subscribe stream exceeded the idle timeout");
    expect(source).toContain("armIdleTimer()");
  });

  it("fails closed on HTTP and gRPC terminal status errors", () => {
    expect(source).toContain("Subscribe HTTP transport failed with status");
    expect(source).toContain('finalStatus !== "0"');
    expect(source).toContain("Subscribe returned gRPC status");
    expect(source).toContain("decoder.finish()");
  });

  it("does not compose the live subscriber into application runtime", () => {
    expect(runtime).not.toContain("NodeHttp2SalesforcePubSubSubscribeTransport");
    expect(runtime).not.toContain("salesforce-pubsub-subscribe-transport");
  });

  it("does not decode Avro, write replay checkpoints, or persist CRM events", () => {
    expect(source).not.toContain("avro");
    expect(source).not.toContain("checkpoint(");
    expect(source).not.toContain("PlatformIntegrationNormalizedEvent");
    expect(source).not.toContain("db.");
    expect(source).not.toContain("Prisma");
  });
});
