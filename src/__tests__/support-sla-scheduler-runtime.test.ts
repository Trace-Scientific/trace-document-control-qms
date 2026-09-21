import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scheduler = readFileSync(join(process.cwd(), "src/lib/platform/support-sla-scheduler.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/internal/platform/support-sla-scan/route.ts"), "utf8");
const runner = readFileSync(join(process.cwd(), "scripts/run-support-sla-scan.mjs"), "utf8");
const health = readFileSync(join(process.cwd(), "src/lib/platform/system-health.ts"), "utf8");
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

describe("support SLA recurring scheduler runtime", () => {
  it("uses a leased scheduled-operation state", () => {
    expect(scheduler).toContain('support.sla.overdue.scan');
    expect(scheduler).toContain('"leaseUntil"');
    expect(scheduler).toContain("LEASE_ACTIVE");
    expect(scheduler).toContain("lastSucceededAt");
    expect(scheduler).toContain("lastFailedAt");
  });

  it("exposes only a machine-authenticated internal endpoint", () => {
    expect(route).toContain("isAuthorizedCronRequest");
    expect(route).toContain("Unauthorized");
    expect(route).not.toContain("authenticatePlatformRequest");
  });

  it("fails closed in the one-shot runner", () => {
    expect(runner).toContain('parsed.protocol !== "https:"');
    expect(runner).toContain("CRON_SECRET must be configured with at least 32 characters");
    expect(runner).toContain('redirect: "error"');
    expect(runner).toContain("/api/internal/platform/support-sla-scan");
  });

  it("publishes an explicit package command", () => {
    expect(pkg.scripts["support:sla:scan"]).toBe("node scripts/run-support-sla-scan.mjs");
  });

  it("surfaces missed and failed runs in platform health", () => {
    expect(health).toContain("SUPPORT_SLA_SCHEDULER_CONFIGURED");
    expect(health).toContain("Support SLA scheduler has not recorded a successful run within 30 minutes.");
    expect(health).toContain("consecutive failure(s)");
  });

  it("does not grant tenant access or create support sessions", () => {
    expect(scheduler).not.toContain("SupportAccessRequest");
    expect(scheduler).not.toContain("SupportSession");
    expect(scheduler).not.toContain("tenant RBAC");
  });
});
