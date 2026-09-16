import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath =
  "prisma/migrations/20260916180000_platform_security_foundation/migration.sql";

describe("platform security boundary", () => {
  it("keeps platform audit rows append-only at the database boundary", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("prevent_platform_audit_event_mutation");
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "PlatformAuditEvent"');
    expect(migration).toContain("PlatformAuditEvent rows are append-only");
  });

  it("does not alter existing tenant tables in the foundation migration", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).not.toMatch(/ALTER TABLE "Organization"/);
    expect(migration).not.toMatch(/ALTER TABLE "Role"/);
    expect(migration).not.toMatch(/ALTER TABLE "Permission"/);
    expect(migration).not.toMatch(/ALTER TABLE "Session"/);
    expect(migration).not.toMatch(/ALTER TABLE "AuditEvent"/);
  });

  it("does not add a platform bypass to tenant authorization", async () => {
    const authorization = await readFile("src/lib/security/authorization.ts", "utf8");
    expect(authorization).not.toMatch(/super.?admin/i);
    expect(authorization).not.toMatch(/bypass.?authorization/i);
    expect(authorization).not.toContain("PlatformAuthorizationContext");
  });

  it("uses tenant authentication only to establish the actor and never copies tenant grants", async () => {
    const source = await readFile("src/lib/platform/authenticated-request.ts", "utf8");
    expect(source).toContain("authenticateRequest(request)");
    expect(source).toContain("tenantActor.userId");
    expect(source).not.toContain("tenantActor.grants");
    expect(source).not.toContain("tenantActor.organizationId");
  });
});
