import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const service = readFileSync(join(process.cwd(), "src/lib/platform/help-support-request.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/help/support-requests/route.ts"), "utf8");
const help = readFileSync(join(process.cwd(), "src/components/help-center.tsx"), "utf8");

describe("customer-visible support request history", () => {
  it("is scoped to the authenticated tenant organization", () => {
    expect(service).toContain('WHERE "organizationId"=${context.organizationId}::uuid');
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("returns only customer-visible support fields", () => {
    expect(service).toContain('SELECT "id","subject","description","category","priority","status"::text AS "status"');
    expect(service).toContain('"submittedAt","acknowledgedAt","closedAt"');
    expect(service).not.toContain("platformIdentityId");
    expect(service).not.toContain("platformMembershipId");
    expect(service).not.toContain("SupportSession");
    expect(service).not.toContain("SupportAccessRequest");
  });

  it("shows status and timestamps without internal Trace workflow details", () => {
    expect(help).toContain("My support requests");
    expect(help).toContain("Acknowledged");
    expect(help).toContain("Closed");
    expect(help).not.toContain("decisionReason");
    expect(help).not.toContain("acknowledgementReason");
    expect(help).not.toContain("supportSessionId");
    expect(help).not.toContain("capabilities");
  });

  it("refreshes history after a successful submission", () => {
    expect(help).toContain("await loadSupportHistory()");
    expect(help).toContain("Refresh");
  });
});
