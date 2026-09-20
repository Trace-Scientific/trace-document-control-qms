import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkpointFromSalesforceFetchResponse,
  decodeSalesforceFetchResponse,
  encodeSalesforceFetchRequest,
  salesforceSubscribeProtocolLimits,
} from "@/lib/platform/salesforce-pubsub-subscribe-protocol";

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

function key(fieldNumber: number, wireType: number) {
  return varint((fieldNumber << 3) | wireType);
}

function bytesField(fieldNumber: number, value: Uint8Array) {
  const payload = Buffer.from(value);
  return Buffer.concat([key(fieldNumber, 2), varint(payload.length), payload]);
}

function stringField(fieldNumber: number, value: string) {
  return bytesField(fieldNumber, Buffer.from(value, "utf8"));
}

function intField(fieldNumber: number, value: number) {
  return Buffer.concat([key(fieldNumber, 0), varint(value)]);
}

function producerEvent(input: { id: string; schemaId: string; payload: Uint8Array }) {
  return Buffer.concat([
    stringField(1, input.id),
    stringField(2, input.schemaId),
    bytesField(3, input.payload),
  ]);
}

function consumerEvent(input: { id: string; schemaId: string; payload: Uint8Array; replayId: Uint8Array }) {
  return Buffer.concat([
    bytesField(1, producerEvent(input)),
    bytesField(2, input.replayId),
  ]);
}

const source = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-pubsub-subscribe-protocol.ts"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);

describe("Salesforce Subscribe protocol foundation", () => {
  it("encodes an initial LATEST FetchRequest without fabricating a replay ID", () => {
    const encoded = encodeSalesforceFetchRequest({
      phase: "INITIAL",
      topic: "/data/AccountChangeEvent",
      replayPreset: "LATEST",
      numRequested: 25,
    });
    expect(encoded).toEqual(Buffer.concat([
      stringField(1, "/data/AccountChangeEvent"),
      intField(4, 25),
    ]));
  });

  it("encodes EARLIEST and CUSTOM replay presets with the reviewed field numbers", () => {
    const earliest = encodeSalesforceFetchRequest({
      phase: "INITIAL",
      topic: "/data/ChangeEvents",
      replayPreset: "EARLIEST",
      numRequested: 10,
    });
    expect(earliest).toEqual(Buffer.concat([
      stringField(1, "/data/ChangeEvents"),
      intField(2, 1),
      intField(4, 10),
    ]));

    const replay = Buffer.from([1, 2, 3, 4]);
    const custom = encodeSalesforceFetchRequest({
      phase: "INITIAL",
      topic: "/data/ChangeEvents",
      replayPreset: "CUSTOM",
      replayIdBase64: replay.toString("base64"),
      numRequested: 5,
    });
    expect(custom).toEqual(Buffer.concat([
      stringField(1, "/data/ChangeEvents"),
      intField(2, 2),
      bytesField(3, replay),
      intField(4, 5),
    ]));
  });

  it("encodes follow-up flow control with num_requested only", () => {
    expect(encodeSalesforceFetchRequest({
      phase: "FLOW_CONTROL",
      numRequested: 60,
    })).toEqual(intField(4, 60));
  });

  it("enforces Salesforce request and replay guardrails", () => {
    expect(salesforceSubscribeProtocolLimits.maxFetchEvents).toBe(100);
    expect(() => encodeSalesforceFetchRequest({
      phase: "FLOW_CONTROL",
      numRequested: 0,
    })).toThrow("between 1 and 100");
    expect(() => encodeSalesforceFetchRequest({
      phase: "FLOW_CONTROL",
      numRequested: 101,
    })).toThrow("between 1 and 100");
    expect(() => encodeSalesforceFetchRequest({
      phase: "INITIAL",
      topic: "/data/ChangeEvents",
      replayPreset: "CUSTOM",
      numRequested: 1,
    })).toThrow("CUSTOM replay requires a replay ID");
    expect(() => encodeSalesforceFetchRequest({
      phase: "INITIAL",
      topic: "/data/ChangeEvents",
      replayPreset: "LATEST",
      replayIdBase64: "AQIDBA==",
      numRequested: 1,
    })).toThrow("allowed only with CUSTOM replay");
  });

  it("decodes events without interpreting Avro payload bytes", () => {
    const eventReplay = Buffer.from([9, 8, 7, 6]);
    const latestReplay = Buffer.from([9, 8, 7, 7]);
    const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const response = Buffer.concat([
      bytesField(1, consumerEvent({
        id: "event-001",
        schemaId: "schema-001",
        payload,
        replayId: eventReplay,
      })),
      bytesField(2, latestReplay),
      stringField(3, "rpc-001"),
      intField(4, 39),
    ]);

    const decoded = decodeSalesforceFetchResponse(response);
    expect(decoded).toEqual({
      events: [{
        eventId: "event-001",
        schemaId: "schema-001",
        payloadBytes: Uint8Array.from(payload),
        replayIdBase64: eventReplay.toString("base64"),
      }],
      latestReplayIdBase64: latestReplay.toString("base64"),
      rpcId: "rpc-001",
      pendingNumRequested: 39,
      keepalive: false,
    });
    expect(checkpointFromSalesforceFetchResponse(decoded)).toEqual({
      replayIdBase64: latestReplay.toString("base64"),
      kind: "EVENT",
    });
  });

  it("recognizes an empty FetchResponse as a keepalive checkpoint", () => {
    const latestReplay = Buffer.from([5, 4, 3, 2, 1]);
    const decoded = decodeSalesforceFetchResponse(Buffer.concat([
      bytesField(2, latestReplay),
      stringField(3, "rpc-keepalive"),
      intField(4, 10),
    ]));

    expect(decoded.events).toEqual([]);
    expect(decoded.keepalive).toBe(true);
    expect(decoded.pendingNumRequested).toBe(10);
    expect(checkpointFromSalesforceFetchResponse(decoded)).toEqual({
      replayIdBase64: latestReplay.toString("base64"),
      kind: "KEEPALIVE",
    });
  });

  it("rejects oversized batches and invalid pending counts", () => {
    const latestReplay = Buffer.from([1]);
    const tooManyEvents = Buffer.concat([
      ...Array.from({ length: 101 }, (_, index) => bytesField(1, consumerEvent({
        id: `event-${index}`,
        schemaId: "schema-001",
        payload: Buffer.from([1]),
        replayId: Buffer.from([index % 255, 1]),
      }))),
      bytesField(2, latestReplay),
    ]);
    expect(() => decodeSalesforceFetchResponse(tooManyEvents)).toThrow("too many events");

    const invalidPending = Buffer.concat([
      bytesField(2, latestReplay),
      intField(4, 101),
    ]);
    expect(() => decodeSalesforceFetchResponse(invalidPending)).toThrow("pending_num_requested is invalid");
  });

  it("contains no network Subscribe transport, Avro decoder, persistence, or runtime composition", () => {
    expect(source).not.toContain("node:http2");
    expect(source).not.toContain("/eventbus.v1.PubSub/Subscribe");
    expect(source).not.toContain("avro");
    expect(source).not.toContain("PlatformIntegrationNormalizedEvent");
    expect(source).not.toContain("db.");
    expect(runtime).not.toContain("salesforce-pubsub-subscribe-protocol");
  });
});
