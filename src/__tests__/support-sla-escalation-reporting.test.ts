import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const escalation = readFileSync(join(process.cwd(), "src/lib/platform/support-sla-escalation.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/platform/support/sla-escalations/route.ts"), "utf8");
const reporting = readFileSync(join(process.cwd(), "src/lib/platform/notifications-reporting.ts"), "utf8");
const supportPanel = readFileSync(join(process.cwd(), "src/components/platform-support-intake-panel.tsx"), "utf8");

describe("support SLA escalation and reporting", () => {
  it("requires platform support authorization to run the scan", () => {
    expect(escalation).toContain('permission: "platform.support.request"');
    expect(route).toContain("authenticatePlatformRequest(request)");
  });

  it("notifies only the assigned Trace support identity", () => {
    expect(escalation).toContain('"assignedToIdentityId" IS NOT NULL');
    expect(escalation).toContain('recipientIdentityId');
    expect(escalation).toContain('item.assignedToIdentityId');
  });

  it("deduplicates response and closure overdue alerts", () => {
    expect(escalation).toContain("help-support-sla:");
    expect(escalation).toContain(":response:overdue");
    expect(escalation).toContain(":closure:overdue");
    expect(escalation).toContain('ON CONFLICT ("dedupeKey")');
  });

  it("keeps escalation in the platform control plane", () => {
    expect(escalation).toContain('"PlatformNotification"');
    expect(escalation).not.toContain("SupportSession");
    expect(escalation).not.toContain("SupportAccessRequest");
    expect(escalation).not.toContain("notificationOutbox");
  });

  it("adds SLA health to governed operational reporting", () => {
    expect(reporting).toContain("overdueResponseSla");
    expect(reporting).toContain("overdueClosureSla");
    expect(reporting).toContain("unassignedActiveRequests");
    expect(reporting).toContain('"HelpSupportRequest"');
  });

  it("exposes an explicit governed scan control to Trace support", () => {
    expect(supportPanel).toContain("Scan overdue SLAs");
    expect(supportPanel).toContain("/api/platform/support/sla-escalations");
  });
});
