import {
  SalesforceCdcSubscriberController,
  type SalesforceCdcSubscriptionCompletion,
} from "./salesforce-cdc-subscriber-controller";

const DEFAULT_MAX_RUN_MS = 240_000;
const MIN_MAX_RUN_MS = 1_000;
const MAX_MAX_RUN_MS = 300_000;

export type SalesforceCdcWorkerRunResult =
  | { outcome: "NO_WORK" }
  | {
      outcome: "COMPLETED";
      subscriptionId: string;
      completion: SalesforceCdcSubscriptionCompletion;
    }
  | {
      outcome: "TIMED_OUT";
      subscriptionId: string;
    };

export class SalesforceCdcOneShotWorkerRunner {
  constructor(
    private readonly controller: SalesforceCdcSubscriberController,
  ) {}

  async runOnce(input: {
    workerId: string;
    maxRunMs?: number;
  }): Promise<SalesforceCdcWorkerRunResult> {
    const maxRunMs = input.maxRunMs ?? DEFAULT_MAX_RUN_MS;
    if (
      !Number.isInteger(maxRunMs) ||
      maxRunMs < MIN_MAX_RUN_MS ||
      maxRunMs > MAX_MAX_RUN_MS
    ) {
      throw new Error("Salesforce CDC one-shot worker maxRunMs is invalid");
    }

    const active = await this.controller.startNext(input.workerId);
    if (!active) return { outcome: "NO_WORK" };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<"TIMEOUT">((resolve) => {
      timer = setTimeout(() => resolve("TIMEOUT"), maxRunMs);
    });

    try {
      const settled = await Promise.race([
        active.done.then((completion) => ({ kind: "DONE" as const, completion })),
        timeout.then(() => ({ kind: "TIMEOUT" as const })),
      ]);

      if (settled.kind === "DONE") {
        return {
          outcome: "COMPLETED",
          subscriptionId: active.subscriptionId,
          completion: settled.completion,
        };
      }

      await active.close();
      return {
        outcome: "TIMED_OUT",
        subscriptionId: active.subscriptionId,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export const salesforceCdcOneShotWorkerLimits = Object.freeze({
  defaultMaxRunMs: DEFAULT_MAX_RUN_MS,
  minMaxRunMs: MIN_MAX_RUN_MS,
  maxMaxRunMs: MAX_MAX_RUN_MS,
});
