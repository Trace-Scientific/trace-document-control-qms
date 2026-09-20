import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const healthService = readFileSync(
  join(process.cwd(), "src/lib/platform/system-health.ts"),
  "utf8",
);
const healthPanel = readFileSync(
  join(process.cwd(), "src/components/platform-system-health-panel.tsx"),
  "utf8",
);
const workerRoute = readFileSync(
  join(process.cwd(), "src/app/api/internal/platform/salesforce-cdc-worker/route.ts"),
  "utf8",
);
const preflight = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-worker-preflight.ts"),
  "utf8",
);
const preflightScript = readFileSync(
  join(process.cwd(), "scripts/check-salesforce-cdc-worker-preflight.mjs"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-worker-runtime.ts"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const dockerfile = readFileSync(
  join(process.cwd(), "Dockerfile.preview"),
  "utf8",
);

describe("Salesforce CDC preview activation observability", () => {
  it("adds sanitized CDC operational telemetry to platform System health", () => {
    expect(healthService).toContain('FROM "PlatformSalesforceCdcSubscription"');
    expect(healthService).toContain('FROM "PlatformSalesforceCdcEventReceipt"');
    expect(healthService).toContain('FROM "PlatformSalesforceCdcNormalizedEvent"');
    expect(healthService).toContain("receiptsLast24Hours");
    expect(healthService).toContain("normalizedEventsLast24Hours");
    expect(healthService).toContain("staleRunning");
    expect(healthPanel).toContain("<h3>Salesforce CDC</h3>");
    expect(healthPanel).toContain("Latest checkpoint");
    expect(healthPanel).toContain("Latest event");
  });

  it("does not expose replay IDs, topics, record IDs, payloads, or credential references in health output", () => {
    const returnedSection = healthService.slice(
      healthService.indexOf("salesforceCdc: {", healthService.indexOf("return {")),
    );
    expect(returnedSection).not.toContain("replayIdBase64");
    expect(returnedSection).not.toContain("credentialRef");
    expect(returnedSection).not.toContain("recordIds");
    expect(returnedSection).not.toContain("payloadBytes");
    expect(healthPanel).not.toContain("replayIdBase64");
    expect(healthPanel).not.toContain("credentialRef");
  });

  it("adds a cron-authenticated GET preflight that never executes the worker", () => {
    expect(workerRoute).toContain("export async function GET");
    expect(workerRoute).toContain("isAuthorizedCronRequest");
    expect(workerRoute).toContain("readSalesforceCdcWorkerPreflight");
    const getBody = workerRoute.slice(
      workerRoute.indexOf("export async function GET"),
      workerRoute.indexOf("export async function POST"),
    );
    expect(getBody).not.toContain("runConfiguredSalesforceCdcWorkerOnce");
    expect(getBody).not.toContain("startNext");
    expect(getBody).toContain('"Cache-Control": "no-store"');
  });

  it("preflight reports only bounded activation conditions", () => {
    expect(preflight).toContain('COUNT(*) FILTER (WHERE "status"=\'READY\')');
    expect(preflight).toContain('COUNT(*) FILTER (WHERE "status"=\'RUNNING\')');
    expect(preflight).toContain('COUNT(*) FILTER (WHERE "status"=\'DEGRADED\')');
    expect(preflight).toContain("activationReady");
    expect(preflight).toContain("configurationValid");
    expect(preflight).toContain("latestCheckpointAt");
    expect(preflight).toContain("latestEventAt");
    expect(preflight).not.toContain("replayIdBase64");
    expect(preflight).not.toContain("credentialRef");
    expect(preflight).not.toContain("recordIds");
    expect(preflight).not.toContain("payloadBytes");
  });

  it("configuration inspection remains non-activating", () => {
    expect(runtime).toContain("inspectSalesforceCdcWorkerConfiguration");
    const inspectBody = runtime.slice(
      runtime.indexOf("export function inspectSalesforceCdcWorkerConfiguration"),
      runtime.indexOf("export function salesforceCdcWorkerConfiguration"),
    );
    expect(inspectBody).not.toContain("createSalesforceCdcWorkerRunner");
    expect(inspectBody).not.toContain("startNext");
  });

  it("packages a secure read-only preflight command for the preview image", () => {
    expect(packageJson.scripts["salesforce:cdc:preflight"])
      .toBe("node scripts/check-salesforce-cdc-worker-preflight.mjs");
    expect(preflightScript).toContain('method: "GET"');
    expect(preflightScript).toContain('parsed.protocol !== "https:"');
    expect(preflightScript).toContain("secret.length < 32");
    expect(preflightScript).toContain("authorization:");
    expect(preflightScript).toContain("Bearer");
    expect(preflightScript).not.toContain("SALESFORCE_CDC_WORKER_ENABLED");
    expect(dockerfile).toContain("check-salesforce-cdc-worker-preflight.mjs");
  });
});
