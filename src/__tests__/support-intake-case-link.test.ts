import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260921044500_support_intake_case_link/migration.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/platform/help-support-queue.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/platform/support/intake/route.ts"), "utf8");
const panel = readFileSync(join(process.cwd(), "src/components/platform-support-intake-panel.tsx"), "utf8");

describe("Help intake to controlled support case linkage", () => {
  it("enforces at most one controlled case per Help request", () => {
    expect(migration).toContain('"sourceHelpSupportRequestId" UUID');
    expect(migration).toContain('CREATE UNIQUE INDEX "SupportCase_sourceHelpSupportRequestId_key"');
    expect(migration).toContain('REFERENCES "HelpSupportRequest"');
  });

  it("requires an explicit platform support action and reason", () => {
    expect(route).toContain('z.literal("CREATE_SUPPORT_CASE")');
    expect(service).toContain('permission: "platform.support.request"');
    expect(service).toContain("validateReason(reason)");
  });

  it("derives the customer account from the same tenant organization", () => {
    expect(service).toContain('"organizationId"=${request.organizationId}::uuid');
    expect(service).toContain("Tenant organization must be linked to a customer account");
    expect(service).toContain("Terminated customer accounts cannot receive new controlled support cases");
  });

  it("does not copy customer description or automatically create access", () => {
    const start = service.indexOf("async createLinkedSupportCase");
    const end = service.indexOf("async acknowledge", start);
    const method = service.slice(start, end);
    expect(method).toContain('"description",');
    expect(method).toContain("NULL");
    expect(method).not.toContain("SupportAccessRequest");
    expect(method).not.toContain("SupportSession");
    expect(method).not.toContain("request.description");
  });

  it("keeps controlled access visibly separate in the Trace queue", () => {
    expect(panel).toContain("Create controlled support case");
    expect(panel).toContain("Tenant access still requires a separate access request and approval.");
    expect(panel).toContain('href="/support-access"');
  });
});
