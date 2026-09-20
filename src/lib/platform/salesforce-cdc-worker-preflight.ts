import { Prisma } from "@prisma/client";
import { db } from "../db";
import { inspectSalesforceCdcWorkerConfiguration } from "./salesforce-cdc-worker-runtime";

type PreflightRow = {
  disabled: bigint;
  ready: bigint;
  running: bigint;
  degraded: bigint;
  staleRunning: bigint;
  latestCheckpointAt: Date | null;
  latestEventAt: Date | null;
};

export type SalesforceCdcWorkerPreflight = {
  workerEnabled: boolean;
  configurationValid: boolean;
  maxRunMs: number | null;
  disabled: number;
  ready: number;
  running: number;
  degraded: number;
  staleRunning: number;
  latestCheckpointAt: string | null;
  latestEventAt: string | null;
  activationReady: boolean;
  detail: string;
};

export async function readSalesforceCdcWorkerPreflight(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SalesforceCdcWorkerPreflight> {
  const config = inspectSalesforceCdcWorkerConfiguration(env);
  const row = (await db.$queryRaw<PreflightRow[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE "status"='DISABLED')::bigint AS "disabled",
      COUNT(*) FILTER (WHERE "status"='READY')::bigint AS "ready",
      COUNT(*) FILTER (WHERE "status"='RUNNING')::bigint AS "running",
      COUNT(*) FILTER (WHERE "status"='DEGRADED')::bigint AS "degraded",
      COUNT(*) FILTER (
        WHERE "status"='RUNNING'
          AND "claimedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
      )::bigint AS "staleRunning",
      MAX("lastCheckpointAt") AS "latestCheckpointAt",
      MAX("lastEventAt") AS "latestEventAt"
    FROM "PlatformSalesforceCdcSubscription"
  `))[0] ?? {
    disabled: BigInt(0),
    ready: BigInt(0),
    running: BigInt(0),
    degraded: BigInt(0),
    staleRunning: BigInt(0),
    latestCheckpointAt: null,
    latestEventAt: null,
  };

  const ready = Number(row.ready);
  const running = Number(row.running);
  const degraded = Number(row.degraded);
  const staleRunning = Number(row.staleRunning);
  const activationReady =
    config.configurationValid &&
    ready > 0 &&
    running === 0 &&
    degraded === 0 &&
    staleRunning === 0;

  return {
    workerEnabled: config.enabled,
    configurationValid: config.configurationValid,
    maxRunMs: config.maxRunMs,
    disabled: Number(row.disabled),
    ready,
    running,
    degraded,
    staleRunning,
    latestCheckpointAt: row.latestCheckpointAt?.toISOString() ?? null,
    latestEventAt: row.latestEventAt?.toISOString() ?? null,
    activationReady,
    detail: !config.configurationValid
      ? "Worker configuration is invalid."
      : ready === 0
        ? "No READY Salesforce CDC subscription is available for a manual run."
        : running > 0 || staleRunning > 0
          ? "A Salesforce CDC subscription is already running or has a stale running claim."
          : degraded > 0
            ? "At least one Salesforce CDC subscription is degraded and requires review."
            : config.enabled
              ? "Worker is enabled and preflight conditions permit one bounded manual run."
              : "Preflight conditions are satisfied; worker remains disabled until explicitly enabled.",
  };
}
