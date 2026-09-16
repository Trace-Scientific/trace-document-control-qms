import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlatformAuthorizationContext } from "@/lib/platform/authorization";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import {
  CUSTOMER_ONLY_SUPPORT_ACTIONS,
  SUPPORT_SESSION_COOKIE,
  SupportAccessService,
  SupportCustomerOnlyActionError,
  hashSupportToken,
  requireSupportActionAllowed,
} from "@/lib/platform/support-access";

const root = process.cwd();
const migration = readFileSync(
  join(root, "prisma/migrations/20260916193000_controlled_support_access/migration.sql"),
  "utf8",
);
const supportSource = readFileSync(join(root, "src/lib/platform/support-access.ts"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");
const sessionRoute = readFileSync(join(root, "src/app/api/platform/support/sessions/route.ts"), "utf8");
const banner = readFileSync(join(root, "src/components/support-access-banner.tsx"), "utf8");

function context(grants: PlatformAuthorizationContext["grants"]): PlatformAuthorizationContext {
  return {
    platformIdentityId: "00000000-0000-4000-8000-000000000001",
    platformMembershipId: "00000000-0000-4000-8000-000000000002",
    identityStatus: "ACTIVE",
    membershipStatus: "ACTIVE",
    grants,
  };
}

describe("controlled support access", () => {
  it("adds support control-plane tables without weakening tenant authorization", () => {
    expect(migration).toContain('CREATE TABLE "SupportCase"');
    expect(migration).toContain('CREATE TABLE "SupportAccessRequest"');
    expect(migration).toContain('CREATE TABLE "SupportAccessApproval"');
    expect(migration).toContain('CREATE TABLE "SupportSession"');
    expect(migration).toContain('CREATE TABLE "SupportSessionEvent"');
    expect(migration).not.toMatch(/ALTER TABLE "Role"/);
    expect(migration).not.toMatch(/ALTER TABLE "Permission"/);
    expect(migration).not.toMatch(/ALTER TABLE "Session"/);
    expect(tenantAuthorization).not.toMatch(/support|platform|super.?admin|bypass/i);
  });

  it("stores only a support session token hash and uses an http-only strict cookie", () => {
    expect(migration).toContain('"tokenHash" TEXT NOT NULL');
    expect(migration).not.toContain('"token" TEXT');
    expect(sessionRoute).toContain(`SUPPORT_SESSION_COOKIE`);
    expect(sessionRoute).toContain('httpOnly: true');
    expect(sessionRoute).toContain('sameSite: "strict"');
    expect(SUPPORT_SESSION_COOKIE).toBe("qms_support_session");
    expect(hashSupportToken("synthetic-token")).toHaveLength(64);
  });

  it("enforces approval separation of duties and requester-bound issuance", () => {
    expect(supportSource).toContain("Support access requests require approval by a different platform member");
    expect(supportSource).toContain("Only the approved requester may issue the support session");
    expect(supportSource).toContain('permission: "platform.support.approve"');
    expect(supportSource).toContain('permission: "platform.support.access"');
  });

  it("bounds support sessions to five through 240 minutes with expiration and revocation", () => {
    expect(supportSource).toContain("Support access duration must be between 5 and 240 minutes");
    expect(supportSource).toContain('"status" = \'EXPIRED\'');
    expect(supportSource).toContain('"status" = \'REVOKED\'');
    expect(migration).toContain('CREATE INDEX "SupportSession_expiresAt_idx"');
  });

  it("makes support approvals and session history append-only", () => {
    expect(migration).toContain("SupportSessionEvent rows are append-only");
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "SupportSessionEvent"');
    expect(migration).toContain("SupportAccessApproval rows are append-only");
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "SupportAccessApproval"');
  });

  it("does not let support identity masquerade as a tenant user in linked audit", () => {
    expect(supportSource).toContain('"actorUserId"');
    expect(supportSource).toContain('NULL, ${event.action}');
    expect(supportSource).toContain('supportSessionId: context.supportSessionId');
    expect(supportSource).toContain('platformIdentityId: context.platformIdentityId');
    expect(supportSource).toContain('platformMembershipId: context.platformMembershipId');
    expect(supportSource).toContain('INSERT INTO "PlatformAuditEvent"');
    expect(supportSource).toContain('INSERT INTO "AuditEvent"');
  });

  it("default-denies customer-only accountable actions", () => {
    expect(CUSTOMER_ONLY_SUPPORT_ACTIONS).toContain("electronic_signature.create");
    expect(CUSTOMER_ONLY_SUPPORT_ACTIONS).toContain("document.approve");
    expect(CUSTOMER_ONLY_SUPPORT_ACTIONS).toContain("legal_hold.release");
    expect(CUSTOMER_ONLY_SUPPORT_ACTIONS).toContain("security.role.manage");
    expect(() => requireSupportActionAllowed("electronic_signature.create")).toThrow(SupportCustomerOnlyActionError);
    expect(() => requireSupportActionAllowed("support.note.add")).not.toThrow();
  });

  it("requires explicit platform support permissions before database access", async () => {
    const service = new SupportAccessService();
    await expect(service.listCases(context([]))).rejects.toBeInstanceOf(PlatformAuthorizationError);
    await expect(service.requestAccess(context([]), {
      caseId: "00000000-0000-4000-8000-000000000003",
      reason: "Synthetic negative authorization test",
      durationMinutes: 30,
      capabilities: ["support.tenant.read"],
    })).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it("renders an unmistakable target-tenant support banner", () => {
    expect(banner).toContain("CONTROLLED SUPPORT ACCESS");
    expect(banner).toContain("targetOrganizationName");
    expect(banner).toContain("Trace support identity remains the recorded actor");
    expect(banner).toContain("Customer-only approvals and signatures are prohibited");
  });
});
