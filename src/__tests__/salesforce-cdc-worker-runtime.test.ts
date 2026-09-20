import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  salesforceCdcWorkerConfiguration,
  salesforceCdcWorkerEnabled,
  salesforceCdcWorkerRuntimeContract,
} from "@/lib/platform/salesforce-cdc-worker-runtime";

const route = readFileSync(
  join(process.cwd(), "src/app/api/internal/platform/salesforce-cdc-worker/route.ts"),
  "utf8",
);
const script = readFileSync(
  join(process.cwd(), "scripts/run-salesforce-cdc-worker.mjs"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-worker-runtime.ts"),
  "utf8",
);
const integrationRuntime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);
const dockerfile = readFileSync(
  join(process.cwd(), "Dockerfile.preview"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("Salesforce CDC deployment-ready worker composition", () => {
  it("is disabled unless the explicit enable flag is exactly true", () => {
    expect(salesforceCdcWorkerEnabled(undefined)).toBe(false);
    expect(salesforceCdcWorkerEnabled("false")).toBe(false);
    expect(salesforceCdcWorkerEnabled("TRUE")).toBe(false);
    expect(salesforceCdcWorkerEnabled("true")).toBe(true);

    expect(() => salesforceCdcWorkerConfiguration({})).toThrow(
      "Salesforce CDC worker is not enabled",
    );
  });

  it("uses the reviewed one-shot default and rejects max-run values outside 1–300 seconds", () => {
    expect(salesforceCdcWorkerConfiguration({
      SALESFORCE_CDC_WORKER_ENABLED: "true",
    })).toEqual({ maxRunMs: 240_000 });

    expect(salesforceCdcWorkerConfiguration({
      SALESFORCE_CDC_WORKER_ENABLED: "true",
      SALESFORCE_CDC_WORKER_MAX_RUN_MS: "120000",
    })).toEqual({ maxRunMs: 120_000 });

    for (const value of ["999", "300001", "1.5", "abc", "-1"]) {
      expect(() => salesforceCdcWorkerConfiguration({
        SALESFORCE_CDC_WORKER_ENABLED: "true",
        SALESFORCE_CDC_WORKER_MAX_RUN_MS: value,
      })).toThrow();
    }
  });

  it("requires both cron bearer authentication and the enable flag at the internal route", () => {
    expect(route).toContain("isAuthorizedCronRequest");
    expect(route).toContain('status: 401');
    expect(route).toContain("salesforceCdcWorkerEnabled");
    expect(route).toContain("Salesforce CDC worker is disabled");
    expect(route).toContain('status: 503');
    expect(route).toContain("runConfiguredSalesforceCdcWorkerOnce");
  });

  it("keeps provider failure details out of the route response", () => {
    expect(route).toContain('error: "Salesforce CDC worker execution failed"');
    expect(route).not.toContain("error.message");
    expect(route).not.toContain("String(error)");
  });

  it("requires the standalone caller to use HTTPS, bearer auth, and the explicit enable flag", () => {
    expect(script).toContain('enabled !== "true"');
    expect(script).toContain('parsed.protocol !== "https:"');
    expect(script).toContain("parsed.username || parsed.password || parsed.search || parsed.hash");
    expect(script).toContain("secret.length < 32");
    expect(script).toContain("authorization: `Bearer ${secret}`");
    expect(script).toContain('redirect: "error"');
    expect(script).toContain("/api/internal/platform/salesforce-cdc-worker");
  });

  it("provides an explicit command and image artifact without scheduler or runtime registration", () => {
    expect(packageJson.scripts["salesforce:cdc:worker"])
      .toBe("node scripts/run-salesforce-cdc-worker.mjs");
    expect(dockerfile).toContain(
      "/app/scripts/run-salesforce-cdc-worker.mjs ./scripts/run-salesforce-cdc-worker.mjs",
    );
    expect(integrationRuntime).not.toContain("SalesforceCdcOneShotWorkerRunner");
    expect(integrationRuntime).not.toContain("salesforce-cdc-worker-runtime");
    expect(runtime).not.toContain("setInterval");
    expect(runtime).not.toContain("setTimeout");
    expect(runtime).not.toContain("requestMore");
  });

  it("documents the exact environment contract names", () => {
    expect(salesforceCdcWorkerRuntimeContract).toMatchObject({
      enabledEnvironmentVariable: "SALESFORCE_CDC_WORKER_ENABLED",
      maxRunMsEnvironmentVariable: "SALESFORCE_CDC_WORKER_MAX_RUN_MS",
      enabledValue: "true",
      workerIdPrefix: "salesforce-cdc-worker",
    });
  });
});
