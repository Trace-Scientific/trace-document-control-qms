import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const assembly = readFileSync(join(process.cwd(), "src/lib/platform/controlled-user-manual-assembly.ts"), "utf8");
const help = readFileSync(join(process.cwd(), "src/lib/platform/help-content.ts"), "utf8");
const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260921062000_manual_draft_unscheduled_effective_date/migration.sql"), "utf8");
const panel = readFileSync(join(process.cwd(), "src/components/platform-controlled-user-manual-panel.tsx"), "utf8");

describe("UM-QMS-001 governed draft assembly", () => {
  it("requires platform help management and a controlled reason", () => {
    expect(assembly).toContain('permission: "platform.help.manage"');
    expect(assembly).toContain("A reason is required");
  });

  it("serializes concurrent assembly and reuses identical reviewed revisions", () => {
    expect(assembly).toContain("pg_advisory_xact_lock");
    expect(assembly).toContain('"body"=${draft.body}');
    expect(assembly).toContain('"changeSummary"=${draft.changeSummary}');
    expect(assembly).toContain("sectionsAlreadyExact");
  });

  it("assembles exactly the canonical reviewed draft set into v0.1", () => {
    expect(assembly).toContain('const INITIAL_DRAFT_VERSION = "0.1"');
    expect(assembly).toContain("CONTROLLED_USER_MANUAL_DRAFTS.length");
    expect(assembly).toContain('publicationState: "DRAFT"');
  });

  it("keeps the first assembled release unscheduled and unpublished", () => {
    expect(assembly).toContain("'DRAFT', NULL");
    expect(assembly).not.toContain("'PUBLISHED'");
    expect(migration).toContain('ALTER COLUMN "effectiveAt" DROP NOT NULL');
    expect(migration).toContain("Published UserManualRelease requires an effectiveAt timestamp");
  });

  it("requires an effective date before publication and filters not-yet-effective releases", () => {
    expect(help).toContain("Set an effective date before publishing a manual release");
    expect(help).toContain('umr."effectiveAt" <= CURRENT_TIMESTAMP');
    expect(help).toContain('umr."effectiveAt" IS NOT NULL');
  });

  it("shows the assembly control and unscheduled draft state to platform authors", () => {
    expect(panel).toContain("Assemble reviewed draft v0.1");
    expect(panel).toContain("It is not published or effective.");
    expect(panel).toContain('"Not scheduled"');
  });
});
