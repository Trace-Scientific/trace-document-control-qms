import { randomUUID } from "node:crypto";
import { platformCredentialResolver } from "./integration-runtime";
import { SalesforceCdcSubscriberController } from "./salesforce-cdc-subscriber-controller";
import {
  SalesforceCdcOneShotWorkerRunner,
  salesforceCdcOneShotWorkerLimits,
  type SalesforceCdcWorkerRunResult,
} from "./salesforce-cdc-one-shot-worker";

const ENABLED_VALUE = "true";
const WORKER_ID_PREFIX = "salesforce-cdc-worker";

function configuredMaxRunMs(value: string | undefined) {
  if (value === undefined || value === "") {
    return salesforceCdcOneShotWorkerLimits.defaultMaxRunMs;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("SALESFORCE_CDC_WORKER_MAX_RUN_MS must be an integer");
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < salesforceCdcOneShotWorkerLimits.minMaxRunMs ||
    parsed > salesforceCdcOneShotWorkerLimits.maxMaxRunMs
  ) {
    throw new Error("SALESFORCE_CDC_WORKER_MAX_RUN_MS is outside the approved range");
  }
  return parsed;
}

export function salesforceCdcWorkerEnabled(
  value = process.env.SALESFORCE_CDC_WORKER_ENABLED,
) {
  return value === ENABLED_VALUE;
}

export function inspectSalesforceCdcWorkerConfiguration(
  env: NodeJS.ProcessEnv = process.env,
) {
  try {
    return {
      enabled: salesforceCdcWorkerEnabled(env.SALESFORCE_CDC_WORKER_ENABLED),
      maxRunMs: configuredMaxRunMs(env.SALESFORCE_CDC_WORKER_MAX_RUN_MS),
      configurationValid: true as const,
    };
  } catch {
    return {
      enabled: salesforceCdcWorkerEnabled(env.SALESFORCE_CDC_WORKER_ENABLED),
      maxRunMs: null,
      configurationValid: false as const,
    };
  }
}

export function salesforceCdcWorkerConfiguration(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!salesforceCdcWorkerEnabled(env.SALESFORCE_CDC_WORKER_ENABLED)) {
    throw new Error("Salesforce CDC worker is not enabled");
  }
  return {
    maxRunMs: configuredMaxRunMs(env.SALESFORCE_CDC_WORKER_MAX_RUN_MS),
  };
}

export function createSalesforceCdcWorkerRunner() {
  const controller = new SalesforceCdcSubscriberController(platformCredentialResolver);
  return new SalesforceCdcOneShotWorkerRunner(controller);
}

export async function runConfiguredSalesforceCdcWorkerOnce(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SalesforceCdcWorkerRunResult> {
  const config = salesforceCdcWorkerConfiguration(env);
  const runner = createSalesforceCdcWorkerRunner();
  const workerId = `${WORKER_ID_PREFIX}:${randomUUID()}`;
  return runner.runOnce({
    workerId,
    maxRunMs: config.maxRunMs,
  });
}

export const salesforceCdcWorkerRuntimeContract = Object.freeze({
  enabledEnvironmentVariable: "SALESFORCE_CDC_WORKER_ENABLED",
  maxRunMsEnvironmentVariable: "SALESFORCE_CDC_WORKER_MAX_RUN_MS",
  enabledValue: ENABLED_VALUE,
  workerIdPrefix: WORKER_ID_PREFIX,
});
