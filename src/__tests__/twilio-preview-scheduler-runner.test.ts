import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runner = readFileSync(join(process.cwd(), "scripts/run-twilio-delivery-monitoring.mjs"), "utf8");
const runbook = readFileSync(join(process.cwd(), "docs/operations/twilio-preview-scheduler-runbook.md"), "utf8");

describe("Twilio preview scheduler readiness", () => {
  it("fails closed unless HTTPS, APP_BASE_URL, and a strong cron secret are configured", () => {
    expect(runner).toContain("APP_BASE_URL is required");
    expect(runner).toContain('parsed.protocol !== "https:"');
    expect(runner).toContain("CRON_SECRET must be configured with at least 32 characters");
  });

  it("invokes only the machine-authenticated monitoring endpoint", () => {
    expect(runner).toContain("/api/internal/platform/twilio-delivery-monitoring");
    expect(runner).toContain('method: "POST"');
    expect(runner).toContain("authorization: `Bearer ${secret}`");
    expect(runner).toContain('redirect: "error"');
  });

  it("contains no direct Twilio provider send or replay path", () => {
    expect(runner).not.toContain("api.twilio.com");
    expect(runner).not.toContain("Messages.json");
    expect(runner).not.toContain("enqueueOutbound");
    expect(runner).not.toContain("requeueDeadLetter");
  });

  it("documents a separate 15-minute Railway cron service and delayed scheduler declaration", () => {
    expect(runbook).toContain("*/15 * * * *");
    expect(runbook).toContain("run-twilio-delivery-monitoring.mjs");
    expect(runbook).toContain("Restart Policy");
    expect(runbook).toContain("Never");
    expect(runbook).toContain("PLATFORM_SCHEDULER_CONFIGURED=true");
    expect(runbook).toContain("Only after");
  });

  it("keeps the preview synthetic-only and out of validation evidence", () => {
    expect(runbook).toContain("synthetic data only");
    expect(runbook).toContain("not validation or production evidence");
    expect(runbook).toContain("protected AWS");
  });
});
