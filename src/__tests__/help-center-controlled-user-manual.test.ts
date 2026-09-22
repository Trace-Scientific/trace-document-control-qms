import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "prisma/migrations/20260916220000_help_center_controlled_user_manual/migration.sql"), "utf8");
const service = readFileSync(join(root, "src/lib/platform/help-content.ts"), "utf8");
const articleRead = readFileSync(join(root, "src/app/api/help/articles/[slug]/route.ts"), "utf8");
const manualList = readFileSync(join(root, "src/app/api/help/manuals/route.ts"), "utf8");
const manualRead = readFileSync(join(root, "src/app/api/help/manuals/[manualCode]/releases/[version]/route.ts"), "utf8");
const shell = readFileSync(join(root, "src/components/platform-administration-shell.tsx"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");

describe("help center and controlled user manual", () => {
  it("preserves help and manual revision/event history as append-only", () => {
    expect(migration).toContain('HelpArticleRevision_immutable');
    expect(migration).toContain('HelpArticleEvent_immutable');
    expect(migration).toContain('UserManualSectionRevision_immutable');
    expect(migration).toContain('UserManualReleaseEvent_immutable');
    expect(migration).toContain('ON DELETE RESTRICT');
  });

  it("pins ordinary help reads to the explicitly published revision", () => {
    expect(service).toContain('har."id" = ha."publishedRevisionId"');
    expect(service).toContain('ha."status" = \'PUBLISHED\'');
    expect(service).toContain('"publishedRevisionId" = ${input.revisionId}::uuid');
    expect(articleRead).toContain("authenticateRequest(request)");
  });

  it("keeps manual release composition mutable only while draft", () => {
    expect(service).toContain('Only draft manual releases can change sections');
    expect(migration).toContain('UserManualReleaseSection_draft_only');
    expect(migration).toContain('Published UserManualRelease configuration is immutable; create a new release');
  });

  it("requires optimistic locking for governed article and release lifecycle changes", () => {
    expect(service).toContain('expectedLockVersion');
    expect(service).toContain('"lockVersion" = "lockVersion" + 1');
    expect(service).toContain('HelpContentConflictError');
  });

  it("gates help/manual mutations with the dedicated platform permission and audits them", () => {
    expect(service).toContain('permission: "platform.help.manage"');
    expect(service).toContain('INSERT INTO "PlatformAuditEvent"');
    expect(service).toContain('manual.release.published');
    expect(service).toContain('help.article.published');
  });

  it("requires authenticated reads and hides future-effective manual releases", () => {
    expect(manualList).toContain("authenticateRequest(request)");
    expect(manualList).toContain("getTime() <= now");
    expect(manualRead).toContain("getTime() > Date.now()");
    expect(manualRead).toContain('status: 404');
  });

  it("does not add help authority or a platform bypass to tenant authorization", () => {
    expect(tenantAuthorization).not.toContain("platform.help.manage");
    expect(tenantAuthorization).not.toContain("superAdmin");
    expect(tenantAuthorization).not.toContain("platform.");
  });

  it("surfaces help content in the control plane without pulling later platform domains forward", () => {
    expect(shell).toContain('label: "Help & User Manual"');
    expect(shell).toContain('platform.help.manage');
    expect(shell).toContain('phase: "foundation"');
  });

  it("contains no destructive help/manual delete API or provider-specific authority", () => {
    expect(service).not.toMatch(/stripe|quickbooks|salesforce|hubspot/i);
    expect(service).not.toMatch(/DELETE FROM "HelpArticle"|DELETE FROM "HelpArticleRevision"|DELETE FROM "UserManual"|DELETE FROM "UserManualSectionRevision"/);
  });
});
