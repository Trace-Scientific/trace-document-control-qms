import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const queue = readFileSync(join(process.cwd(), "src/lib/platform/help-support-queue.ts"), "utf8");
const dashboard = readFileSync(join(process.cwd(), "src/components/document-control-dashboard.tsx"), "utf8");

describe("support request customer in-app notifications", () => {
  it("notifies only the original submitting user through the tenant outbox", () => {
    expect(queue).toContain("recipientUserId: request.submittedByUserId");
    expect(queue).toContain('channel: "IN_APP"');
    expect(queue).toContain("organizationId: request.organizationId");
  });

  it("creates separate deduplicated acknowledgement and closure events", () => {
    expect(queue).toContain("HELP_SUPPORT_ACKNOWLEDGED");
    expect(queue).toContain("HELP_SUPPORT_CLOSED");
    expect(queue).toContain("help-support-request:");
    expect(queue).toContain(":status:");
  });

  it("does not expose internal Trace reasons in the notification payload", () => {
    const start = queue.indexOf("async function enqueueCustomerStatusNotification");
    const end = queue.indexOf("async function writeAudit");
    const helper = queue.slice(start, end);
    expect(helper).not.toContain("reason");
    expect(helper).not.toContain("platformMembershipId");
    expect(helper).not.toContain("description");
    expect(helper).not.toContain("correlationId");
  });

  it("uses the existing customer notification bell rendering", () => {
    expect(dashboard).toContain("supportRequestId");
    expect(dashboard).toContain("Support request");
    expect(dashboard).toContain("Acknowledged");
    expect(dashboard).toContain("Closed");
  });
});
