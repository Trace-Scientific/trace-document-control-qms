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
  const controller = new SalesforceCdcSubscriberController(
    credentials,
    state,
    transport,
  );
  return {
    controller,
    state,
    credentials,
    transport,
    sendInitial,
    requestMore,
    close,
    callbacks: () => callbacks!,
  };
}

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

  it("does not advance an event replay checkpoint before durable event persistence exists", async () => {
    const h = harness();
    await h.controller.startNext("worker-004");

    await h.callbacks().onResponse({
      events: [{
        eventId: "event-001",
        schemaId: "schema-001",
        payloadBytes: Uint8Array.from([1, 2, 3]),
        replayIdBase64: Buffer.from([9, 9]).toString("base64"),
      }],
      latestReplayIdBase64: Buffer.from([9, 10]).toString("base64"),
      rpcId: "rpc-event",
      pendingNumRequested: 9,
      keepalive: false,
    });

    expect(h.state.checkpoint).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.state.markDegraded).toHaveBeenCalledWith(
      claim().id,
      "worker-004",
      "EVENT_PERSISTENCE_NOT_ENABLED",
    );
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
});
