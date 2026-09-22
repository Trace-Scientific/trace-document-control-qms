import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const root=process.cwd();
const evidence=[
  "src/__tests__/platform-subscriptions-workspace.test.ts",
  "src/__tests__/product-plan-subscription-entitlements.test.ts",
  "src/__tests__/entitlement-override-administration.test.ts",
  "src/__tests__/subscription-contracted-terms.test.ts",
  "src/__tests__/plan-pricing-business-approval.test.ts",
  "src/__tests__/commercial-pricing-analysis.test.ts",
  "src/__tests__/contextual-help-entrypoints.test.ts",
  "src/__tests__/contextual-help-deep-links.test.ts",
  "src/__tests__/help-center-controlled-user-manual.test.ts",
  "src/__tests__/controlled-user-manual-pdf-snapshots.test.ts",
  "src/__tests__/help-support-request-intake.test.ts",
  "src/__tests__/role-aware-help-recommendations.test.ts",
  "src/__tests__/sales-ownership-workspace.test.ts",
  "src/__tests__/commission-administration-workspace.test.ts",
  "src/__tests__/sales-representative-scoping.test.ts",
  "src/__tests__/platform-security-administration.test.ts",
  "src/__tests__/platform-audit-browser.test.ts",
  "src/__tests__/platform-system-health.test.ts",
  "src/__tests__/controlled-support-access.test.ts",
  "src/__tests__/support-tenant-isolation-gate.test.ts",
];

describe("platform/commercial/help acceptance evidence",()=>{
  it("retains the focused CI evidence referenced by the closure matrix",()=>{
    for(const relative of evidence){
      expect(existsSync(join(root,relative)),relative+" must remain present").toBe(true);
    }
  });

  it("retains the acceptance evidence matrix",()=>{
    const path=join(root,"docs/architecture/platform-commercial-help-acceptance-evidence.md");
    expect(existsSync(path)).toBe(true);
    const body=readFileSync(path,"utf8");
    expect(body).toContain("Commercial packaging — subscription plans, entitlements, billing model, and pricing readiness");
    expect(body).toContain("Help Center — contextual how-tos, electronic user manual, and support requests");
    expect(body).toContain("Commercial Administration — customer sales ownership and commission tracking");
    expect(body).toContain("Platform Administration — cross-tenant owner, support access, subscriptions, and platform audit");
  });

  it("retains the exact-target controlled-support tenant boundary",()=>{
    const source=readFileSync(join(root,"src/lib/platform/support-access.ts"),"utf8");
    expect(source).toContain("requireSupportTargetOrganization");
    expect(source).toContain("context.targetOrganizationId !== organizationId");
    expect(source).toContain("Support session is not authorized for the requested tenant organization");
  });

  it("retains tenant authorization without platform/support bypass semantics",()=>{
    const source=readFileSync(join(root,"src/lib/security/authorization.ts"),"utf8");
    expect(source).not.toMatch(/platform|support|super.?admin|bypass/i);
  });

  it("retains explicit business approval for activated pricing",()=>{
    const source=readFileSync(join(root,"src/lib/platform/subscriptions.ts"),"utf8");
    expect(source).toContain("businessApprovalReason");
    expect(source).toContain('"businessApprovedByIdentityId"');
    expect(source).toContain("Only a commercially complete draft plan version can be business-approved and activated");
  });

  it("retains published-only Help content boundary",()=>{
    const source=readFileSync(join(root,"src/lib/platform/help-content.ts"),"utf8");
    expect(source).toContain('"status" = \'PUBLISHED\'');
  });
});
