import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260921033000_help_support_assignment_sla/migration.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/platform/help-support-queue.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/platform/support/intake/route.ts"), "utf8");
const panel = readFileSync(join(process.cwd(), "src/components/platform-support-intake-panel.tsx"), "utf8");

describe("Trace support assignment and SLA tracking", () => {
  it("stores control-plane assignment without creating tenant-access authority", () => {
    expect(migration).toContain('"assignedToIdentityId" UUID');
    expect(migration).toContain('REFERENCES "PlatformIdentity"');
    expect(migration).not.toContain("SupportSession");
    expect(migration).not.toContain("SupportAccessRequest");
  });

  it("allows only active support-authorized platform identities to own requests", () => {
    expect(service).toContain("listAssignableOwners");
    expect(service).toContain("pp.\"key\" = 'platform.support.request'");
    expect(service).toContain("Assignee must be an active platform support member");
  });

  it("tracks bounded response and closure SLA targets", () => {
    expect(service).toContain("responseDueAt");
    expect(service).toContain("closureDueAt");
    expect(service).toContain("'OVERDUE'");
    expect(service).toContain("Closure due time cannot be earlier than response due time");
    expect(service).toContain("must be a future timestamp");
  });

  it("audits assignment while keeping it separate from support access", () => {
    expect(service).toContain('"help_support_request.assigned"');
    expect(service).not.toContain("support.tenant.");
    expect(route).toContain('z.literal("ASSIGN")');
  });

  it("surfaces owner and SLA state in the Trace queue", () => {
    expect(panel).toContain("Assign / SLA");
    expect(panel).toContain("Unassigned");
    expect(panel).toContain("Response");
    expect(panel).toContain("Closure");
  });
});
