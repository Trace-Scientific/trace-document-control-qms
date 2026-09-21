import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const service = readFileSync(join(process.cwd(), "src/lib/platform/help-support-request.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/help/support-requests/route.ts"), "utf8");
const help = readFileSync(join(process.cwd(), "src/components/help-center.tsx"), "utf8");

describe("customer-visible support request history", () => {
  it("scopes history to the authenticated organization and submitting user", () => {
    expect(service).toContain('"organizationId"=${context.organizationId}::uuid');
    expect(service).toContain('"submittedByUserId"=${context.userId}::uuid');
    expect(route).toContain("authenticateRequest(request)");
  });

  it("returns a bounded customer-safe history projection", () => {
    expect(service).toContain('SELECT "id","subject","category","priority","status"::text AS "status","submittedAt","acknowledgedAt","closedAt"');
    expect(service).not.toContain('SELECT "id","subject","description"');
    expect(service).not.toContain("PlatformAuditEvent");
    expect(service).not.toContain("SupportSession");
  });

  it("uses no-store caching for support history", () => {
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("shows customer-readable statuses without internal Trace data", () => {
    expect(help).toContain("My support requests");
    expect(help).toContain("Acknowledged");
    expect(help).toContain("Closed");
    expect(help).toContain("Internal Trace notes, platform audit details, and controlled support-access information are never displayed here.");
    expect(help).not.toContain("acknowledgementReason");
    expect(help).not.toContain("closureReason");
  });
});
