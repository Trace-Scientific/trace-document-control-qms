import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SalesforceCdcSubscriberController } from "@/lib/platform/salesforce-cdc-subscriber-controller";
import type { SalesforceSubscribeStreamCallbacks } from "@/lib/platform/salesforce-pubsub-subscribe-transport";

function claim(overrides: Partial<{
  replayIdBase64: string | null;
  credentialRef: string;
}> = {}) {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    connectionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    topic: "/data/AccountChangeEvent",
    replayIdBase64: null,
    credentialRef: "aws-sm://platform/salesforce",
    ...overrides,
  };
}

function credential() {
  return JSON.stringify({
    accessToken: "synthetic-salesforce-access-token",
    instanceUrl: "https://example.my.salesforce.com",
    tenantId: "00D000000000001AAA",
  });
}

function harness(claimValue = claim(), credentialValue: string | null = credential()) {
  const checkpoint = vi.fn(async () => undefined);
  const release = vi.fn(async () => undefined);
  const markDegraded = vi.fn(async () => undefined);
  const state = {
    claimReady: vi.fn(async () => [claimValue]),
    checkpoint,
    release,
    markDegraded,
  };
  const credentials = {
    resolve: vi.fn(async () => credentialValue),
  };
  let callbacks: SalesforceSubscribeStreamCallbacks | null = null;
  const sendInitial = vi.fn();
  const requestMore = vi.fn();
  const close = vi.fn();
  const transport = {
    open: vi.fn((input: { callbacks: SalesforceSubscribeStreamCallbacks }) => {
      callbacks = input.callbacks;
      return { sendInitial, requestMore, close };
    }),
  };
  const persist = vi.fn(async () => ({
    id: "receipt-001",
    duplicate: false,
    payloadSha256: "a".repeat(64),
  }));
  const receipts = { persist };
  const schema = {
    schemaId: "schema-001",
    schemaJson: JSON.stringify({
      type: "record",
      name: "AccountChangeEvent",
      fields: [{ name: "ChangeEventHeader", type: {
        type: "record",
        name: "ChangeEventHeader",
        fields: [],
      } }],
    }),
    schemaSha256: "b".repeat(64),
    rpcId: "rpc-schema-001",
  };
  const schemas = {
    resolve: vi.fn(async () => schema),
  };
  const interpretation = {
    receiptId: "receipt-001",
    schemaId: "schema-001",
    schemaSha256: schema.schemaSha256,
    payloadSha256: "a".repeat(64),
    value: {
      ChangeEventHeader: {
        entityName: "Account",
        recordIds: ["001000000000001AAA"],
        changeType: "UPDATE",
        changeOrigin: null,
        transactionKey: "transaction-001",
        sequenceNumber: 1,
        commitTimestamp: 1789875000000,
        commitUser: "005000000000001AAA",
        commitNumber: 42,
        changedFields: [],
        nulledfields: [],
        diffFields: [],
      },
    },
  };
  const interpretations = {
    interpret: vi.fn(() => interpretation),
  };
  const normalized = {
    receiptId: "receipt-001",
    schemaId: "schema-001",
    schemaSha256: schema.schemaSha256,
    payloadSha256: "a".repeat(64),
    header: {
      entityName: "Account",
      recordIds: ["001000000000001AAA"],
      changeType: "UPDATE" as const,
      changeOrigin: null,
      transactionKey: "transaction-001",
      sequenceNumber: 1,
      commitTimestamp: 1789875000000,
      commitUser: "005000000000001AAA",
      commitNumber: 42,
      changedFields: [],
      nulledFields: [],
      diffFields: [],
    },
  };
  const normalizer = {
    normalize: vi.fn(() => normalized),
  };
  const normalizedPersist = vi.fn(async () => ({
    id: "normalized-001",
    duplicate: false,
    normalizedSha256: "c".repeat(64),
  }));
  const normalizedEvents = { persist: normalizedPersist };
  const controller = new SalesforceCdcSubscriberController(
    credentials,
    state,
    transport,
    receipts,
    schemas,
    interpretations,
    normalizer,
    normalizedEvents,
  );
  return {
    controller,
    state,
    credentials,
    transport,
    sendInitial,
    requestMore,
    close,
    receipts,
    schemas,
    interpretations,
    normalizer,
    normalizedEvents,
    callbacks: () => callbacks!,
  };
}

const runtime = readFileSync(join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");

describe("Salesforce CDC subscriber controller", () => {
  it("claims one READY subscription and starts at LATEST when no replay checkpoint exists", async () => {
    const h = harness();

    const active = await h.controller.startNext("worker-001");

    expect(h.state.claimReady).toHaveBeenCalledWith("worker-001", 1);
    expect(h.credentials.resolve).toHaveBeenCalledWith("aws-sm://platform/salesforce");
    expect(h.transport.open).toHaveBeenCalledTimes(1);
    expect(h.sendInitial).toHaveBeenCalledWith({
      phase: "INITIAL",
      topic: "/data/AccountChangeEvent",
      replayPreset: "LATEST",
      numRequested: 10,
    });
    expect(active?.replayMode).toBe("LATEST");
  });

  it("resumes with CUSTOM replay when a durable replay ID exists", async () => {
    const replayIdBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");
    const h = harness(claim({ replayIdBase64 }));

    const active = await h.controller.startNext("worker-002");

    expect(h.sendInitial).toHaveBeenCalledWith({
      phase: "INITIAL",
      topic: "/data/AccountChangeEvent",
      replayPreset: "CUSTOM",
      replayIdBase64,
      numRequested: 10,
    });
    expect(active?.replayMode).toBe("CUSTOM");
  });

  it("checkpoints verified keepalive replay progress under worker ownership", async () => {
    const h = harness();
    await h.controller.startNext("worker-003");

    const replayIdBase64 = Buffer.from([5, 6, 7]).toString("base64");
    await h.callbacks().onResponse({
      events: [],
      latestReplayIdBase64: replayIdBase64,
      rpcId: "rpc-keepalive",
      pendingNumRequested: 10,
      keepalive: true,
    });

    expect(h.state.checkpoint).toHaveBeenCalledWith({
      subscriptionId: claim().id,
      workerId: "worker-003",
      replayIdBase64,
      kind: "KEEPALIVE",
    });
    expect(h.state.markDegraded).not.toHaveBeenCalled();
  });

  it("completes receipt, schema, interpretation, normalization, and normalized persistence before EVENT checkpoint", async () => {
    const h = harness();
    await h.controller.startNext("worker-004");

    const eventReplayId = Buffer.from([9, 9]).toString("base64");
    const latestReplayIdBase64 = Buffer.from([9, 10]).toString("base64");
    const event = {
      eventId: "event-001",
      schemaId: "schema-001",
      payloadBytes: Uint8Array.from([1, 2, 3]),
      replayIdBase64: eventReplayId,
    };

    await h.callbacks().onResponse({
      events: [event],
      latestReplayIdBase64,
      rpcId: "rpc-event",
      pendingNumRequested: 9,
      keepalive: false,
    });

    expect(h.receipts.persist).toHaveBeenCalledWith({
      subscriptionId: claim().id,
      connectionId: claim().connectionId,
      topic: claim().topic,
      event,
    });
    expect(h.schemas.resolve).toHaveBeenCalledWith({
      metadata: {
        accesstoken: "synthetic-salesforce-access-token",
        instanceurl: "https://example.my.salesforce.com",
        tenantid: "00D000000000001AAA",
      },
      schemaId: "schema-001",
    });
    expect(h.interpretations.interpret).toHaveBeenCalledTimes(1);
    expect(h.normalizer.normalize).toHaveBeenCalledTimes(1);
    expect(h.normalizedEvents.persist).toHaveBeenCalledTimes(1);
    expect(h.state.checkpoint).toHaveBeenCalledWith({
      subscriptionId: claim().id,
      workerId: "worker-004",
      replayIdBase64: latestReplayIdBase64,
      kind: "EVENT",
    });

    const receiptOrder = h.receipts.persist.mock.invocationCallOrder[0];
    const schemaOrder = h.schemas.resolve.mock.invocationCallOrder[0];
    const interpretationOrder = h.interpretations.interpret.mock.invocationCallOrder[0];
    const normalizeOrder = h.normalizer.normalize.mock.invocationCallOrder[0];
    const normalizedPersistOrder = h.normalizedEvents.persist.mock.invocationCallOrder[0];
    const checkpointOrder = h.state.checkpoint.mock.invocationCallOrder[0];
    expect(receiptOrder).toBeLessThan(schemaOrder);
    expect(schemaOrder).toBeLessThan(interpretationOrder);
    expect(interpretationOrder).toBeLessThan(normalizeOrder);
    expect(normalizeOrder).toBeLessThan(normalizedPersistOrder);
    expect(normalizedPersistOrder).toBeLessThan(checkpointOrder);
    expect(h.state.markDegraded).not.toHaveBeenCalled();
  });

  it("never advances EVENT replay when durable receipt persistence fails", async () => {
    const h = harness();
    h.receipts.persist.mockRejectedValueOnce(new Error("synthetic persistence failure"));
    await h.controller.startNext("worker-004b");

    await h.callbacks().onResponse({
      events: [{
        eventId: "event-002",
        schemaId: "schema-001",
        payloadBytes: Uint8Array.from([4, 5, 6]),
        replayIdBase64: Buffer.from([10, 1]).toString("base64"),
      }],
      latestReplayIdBase64: Buffer.from([10, 2]).toString("base64"),
      rpcId: "rpc-event-2",
      pendingNumRequested: 9,
      keepalive: false,
    });

    expect(h.state.checkpoint).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.state.markDegraded).toHaveBeenCalledWith(
      claim().id,
      "worker-004b",
      "EVENT_RECEIPT_PERSIST_FAILED",
    );
  });

  it("never advances EVENT replay when event schema resolution fails", async () => {
    const h = harness();
    h.schemas.resolve.mockRejectedValueOnce(new Error("synthetic schema failure"));
    await h.controller.startNext("worker-004c");

    await h.callbacks().onResponse({
      events: [{
        eventId: "event-003",
        schemaId: "schema-003",
        payloadBytes: Uint8Array.from([7, 8, 9]),
        replayIdBase64: Buffer.from([11, 1]).toString("base64"),
      }],
      latestReplayIdBase64: Buffer.from([11, 2]).toString("base64"),
      rpcId: "rpc-event-3",
      pendingNumRequested: 9,
      keepalive: false,
    });

    expect(h.state.checkpoint).not.toHaveBeenCalled();
    expect(h.normalizedEvents.persist).not.toHaveBeenCalled();
    expect(h.state.markDegraded).toHaveBeenCalledWith(
      claim().id,
      "worker-004c",
      "EVENT_SCHEMA_RESOLUTION_FAILED",
    );
  });

  it("never advances EVENT replay when interpretation, normalization, or normalized persistence fails", async () => {
    for (const [workerId, fail, expectedCode] of [
      ["worker-004d", "interpret", "EVENT_INTERPRETATION_FAILED"],
      ["worker-004e", "normalize", "EVENT_NORMALIZATION_FAILED"],
      ["worker-004f", "persist", "NORMALIZED_EVENT_PERSIST_FAILED"],
    ] as const) {
      const h = harness();
      if (fail === "interpret") h.interpretations.interpret.mockImplementationOnce(() => { throw new Error("synthetic"); });
      if (fail === "normalize") h.normalizer.normalize.mockImplementationOnce(() => { throw new Error("synthetic"); });
      if (fail === "persist") h.normalizedEvents.persist.mockRejectedValueOnce(new Error("synthetic"));

      await h.controller.startNext(workerId);
      await h.callbacks().onResponse({
        events: [{
          eventId: `event-${workerId}`,
          schemaId: "schema-001",
          payloadBytes: Uint8Array.from([1, 2, 3]),
          replayIdBase64: Buffer.from([12, 1]).toString("base64"),
        }],
        latestReplayIdBase64: Buffer.from([12, 2]).toString("base64"),
        rpcId: "rpc-event-failure",
        pendingNumRequested: 9,
        keepalive: false,
      });

      expect(h.state.checkpoint).not.toHaveBeenCalled();
      expect(h.state.markDegraded).toHaveBeenCalledWith(
        claim().id,
        workerId,
        expectedCode,
      );
    }
  });

  it("reuses one governed schema lookup for multiple events with the same schema inside a response", async () => {
    const h = harness();
    await h.controller.startNext("worker-004g");

    await h.callbacks().onResponse({
      events: [
        {
          eventId: "event-a",
          schemaId: "schema-001",
          payloadBytes: Uint8Array.from([1]),
          replayIdBase64: Buffer.from([13, 1]).toString("base64"),
        },
        {
          eventId: "event-b",
          schemaId: "schema-001",
          payloadBytes: Uint8Array.from([2]),
          replayIdBase64: Buffer.from([13, 2]).toString("base64"),
        },
      ],
      latestReplayIdBase64: Buffer.from([13, 3]).toString("base64"),
      rpcId: "rpc-event-cache",
      pendingNumRequested: 8,
      keepalive: false,
    });

    expect(h.schemas.resolve).toHaveBeenCalledTimes(1);
    expect(h.receipts.persist).toHaveBeenCalledTimes(2);
    expect(h.normalizedEvents.persist).toHaveBeenCalledTimes(2);
    expect(h.state.checkpoint).toHaveBeenCalledTimes(1);
  });

  it("degrades safely when governed credentials cannot be resolved", async () => {
    const h = harness(claim(), null);

    const active = await h.controller.startNext("worker-005");

    expect(active).toBeNull();
    expect(h.transport.open).not.toHaveBeenCalled();
    expect(h.state.markDegraded).toHaveBeenCalledWith(
      claim().id,
      "worker-005",
      "CREDENTIAL_UNAVAILABLE",
    );
  });

  it("releases a healthy stream on normal end or explicit close", async () => {
    const h = harness();
    const active = await h.controller.startNext("worker-006");

    await active!.close();
    expect(h.state.release).toHaveBeenCalledWith(claim().id, "worker-006");

    const h2 = harness();
    await h2.controller.startNext("worker-007");
    await h2.callbacks().onEnd();
    expect(h2.state.release).toHaveBeenCalledWith(claim().id, "worker-007");
  });

  it("marks stream failures degraded without exposing provider error text as the failure code", async () => {
    const h = harness();
    await h.controller.startNext("worker-008");

    await h.callbacks().onError(new Error("provider secret-like diagnostic"));

    expect(h.state.markDegraded).toHaveBeenCalledWith(
      claim().id,
      "worker-008",
      "SUBSCRIBE_STREAM_FAILED",
    );
  });

  it("does not issue autonomous flow-control requests", async () => {
    const h = harness();
    await h.controller.startNext("worker-009");

    await h.callbacks().onResponse({
      events: [],
      latestReplayIdBase64: Buffer.from([7, 7]).toString("base64"),
      rpcId: "rpc-keepalive",
      pendingNumRequested: 1,
      keepalive: true,
    });

    expect(h.requestMore).not.toHaveBeenCalled();
  });

  it("is not composed into normal application runtime", () => {
    expect(runtime).not.toContain("SalesforceCdcSubscriberController");
    expect(runtime).not.toContain("salesforce-cdc-subscriber-controller");
  });
});
