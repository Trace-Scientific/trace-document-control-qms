import { describe, expect, it, vi } from "vitest";
import {
  SalesforceCdcOneShotWorkerRunner,
  salesforceCdcOneShotWorkerLimits,
} from "@/lib/platform/salesforce-cdc-one-shot-worker";
import type { SalesforceCdcSubscriberController } from "@/lib/platform/salesforce-cdc-subscriber-controller";

function controllerHarness(activeValue: Awaited<ReturnType<SalesforceCdcSubscriberController["startNext"]>>) {
  return {
    controller: {
      startNext: vi.fn(async () => activeValue),
    } as unknown as SalesforceCdcSubscriberController,
  };
}

describe("Salesforce CDC bounded one-shot worker", () => {
  it("returns NO_WORK when no READY subscription can be claimed", async () => {
    const h = controllerHarness(null);
    const runner = new SalesforceCdcOneShotWorkerRunner(h.controller);

    await expect(runner.runOnce({
      workerId: "worker-no-work",
      maxRunMs: 1_000,
    })).resolves.toEqual({ outcome: "NO_WORK" });
  });

  it("returns controller completion without forcing a second close", async () => {
    const close = vi.fn(async () => undefined);
    const active = {
      subscriptionId: "11111111-2222-4333-8444-555555555555",
      connectionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      topic: "/data/AccountChangeEvent",
      replayMode: "LATEST" as const,
      done: Promise.resolve({ outcome: "ENDED" as const }),
      close,
    };
    const h = controllerHarness(active);
    const runner = new SalesforceCdcOneShotWorkerRunner(h.controller);

    await expect(runner.runOnce({
      workerId: "worker-ended",
      maxRunMs: 1_000,
    })).resolves.toEqual({
      outcome: "COMPLETED",
      subscriptionId: active.subscriptionId,
      completion: { outcome: "ENDED" },
    });
    expect(close).not.toHaveBeenCalled();
  });

  it("closes and releases a healthy subscription when the bounded run expires", async () => {
    vi.useFakeTimers();
    try {
      let resolveDone!: (value: { outcome: "CLOSED" }) => void;
      const done = new Promise<{ outcome: "CLOSED" }>((resolve) => {
        resolveDone = resolve;
      });
      const close = vi.fn(async () => {
        resolveDone({ outcome: "CLOSED" });
      });
      const active = {
        subscriptionId: "11111111-2222-4333-8444-555555555555",
        connectionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        topic: "/data/AccountChangeEvent",
        replayMode: "LATEST" as const,
        done,
        close,
      };
      const h = controllerHarness(active);
      const runner = new SalesforceCdcOneShotWorkerRunner(h.controller);

      const resultPromise = runner.runOnce({
        workerId: "worker-timeout",
        maxRunMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(resultPromise).resolves.toEqual({
        outcome: "TIMED_OUT",
        subscriptionId: active.subscriptionId,
      });
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces reviewed one-shot runtime bounds", async () => {
    expect(salesforceCdcOneShotWorkerLimits.defaultMaxRunMs).toBe(240_000);
    expect(salesforceCdcOneShotWorkerLimits.minMaxRunMs).toBe(1_000);
    expect(salesforceCdcOneShotWorkerLimits.maxMaxRunMs).toBe(300_000);

    const h = controllerHarness(null);
    const runner = new SalesforceCdcOneShotWorkerRunner(h.controller);

    await expect(runner.runOnce({
      workerId: "worker-too-short",
      maxRunMs: 999,
    })).rejects.toThrow("maxRunMs is invalid");

    await expect(runner.runOnce({
      workerId: "worker-too-long",
      maxRunMs: 300_001,
    })).rejects.toThrow("maxRunMs is invalid");
  });
});
