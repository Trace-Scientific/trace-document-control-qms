import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scheduler = readFileSync(join(process.cwd(), "src/lib/platform/twilio-monitoring-scheduler.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/internal/platform/twilio-delivery-monitoring/route.ts"), "utf8");
const health = readFileSync(join(process.cwd(), "src/lib/platform/system-health.ts"), "utf8");
const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260917194500_platform_scheduler_operation_state/migration.sql"), "utf8");

describe("Twilio scheduler execution and alert routing", () => {
  it("requires cron bearer authentication for machine invocation", () => {
    expect(route).toContain("isAuthorizedCronRequest");
    expect(route).toContain("status: 401");
    expect(route).toContain("runScheduled(25)");
  });

  it("uses a bounded lease to prevent overlapping scheduled executions", () => {
    expect(scheduler).toContain("LEASE_MINUTES = 10");
    expect(scheduler).toContain('"leaseUntil" < CURRENT_TIMESTAMP');
    expect(scheduler).toContain('reason: "LEASE_ACTIVE"');
  });

  it("does not add any outbound SMS send or replay path", () => {
    expect(scheduler).not.toContain("enqueueOutbound");
    expect(scheduler).not.toContain("requeueDeadLetter");
    expect(scheduler).not.toContain("Messages.json");
    expect(scheduler).toContain("this.monitoring.pollDue");
  });

  it("routes deduplicated in-app alerts only to active platform integration operators", () => {
    expect(scheduler).toContain("platform.integration.manage");
    expect(scheduler).toContain("PlatformNotification");
    expect(scheduler).toContain("ON CONFLICT (\"dedupeKey\")");
    expect(scheduler).toContain("pm.\"status\"='ACTIVE'");
    expect(scheduler).toContain("pi.\"status\"='ACTIVE'");
  });

  it("tracks scheduler heartbeat and degrades health when configured but overdue or failing", () => {
    expect(health).toContain("PLATFORM_SCHEDULER_CONFIGURED");
    expect(health).toContain("30 * 60 * 1000");
    expect(health).toContain("consecutiveFailures");
    expect(health).toContain("scheduler heartbeat is current");
  });

  it("adds operational lease state without granting authority", () => {
    expect(migration).toContain('CREATE TABLE "PlatformScheduledOperationState"');
    expect(migration).toContain('"operationKey" TEXT PRIMARY KEY');
    expect(migration).not.toContain("PlatformPermission");
    expect(migration).not.toContain("PlatformRole");
  });
});
