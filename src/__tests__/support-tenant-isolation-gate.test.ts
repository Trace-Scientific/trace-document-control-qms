import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";
import {
  SupportCapabilityDeniedError,
  SupportTargetOrganizationDeniedError,
  requireSupportCapability,
  requireSupportTargetOrganization,
  type SupportSessionContext,
} from "@/lib/platform/support-access";

const tenantAuthorization=readFileSync(join(process.cwd(),"src/lib/security/authorization.ts"),"utf8");
const supportAuth=readFileSync(join(process.cwd(),"src/lib/platform/support-authenticated-request.ts"),"utf8");
const supportApi=readFileSync(join(process.cwd(),"src/lib/platform/support-access-api.ts"),"utf8");

function supportContext(overrides:Partial<SupportSessionContext>={}):SupportSessionContext{
  return {
    supportSessionId:"00000000-0000-4000-8000-000000000001",
    supportCaseId:"00000000-0000-4000-8000-000000000002",
    platformIdentityId:"00000000-0000-4000-8000-000000000003",
    platformMembershipId:"00000000-0000-4000-8000-000000000004",
    targetOrganizationId:"00000000-0000-4000-8000-000000000005",
    targetOrganizationName:"Synthetic Tenant A",
    expiresAt:new Date(Date.now()+60_000),
    capabilities:["support.tenant.read"],
    ...overrides,
  };
}

describe("support tenant isolation gate",()=>{
  it("denies a support session when the requested tenant does not exactly match the session target",()=>{
    const context=supportContext();
    expect(()=>requireSupportTargetOrganization(context,"00000000-0000-4000-8000-000000000006"))
      .toThrow(SupportTargetOrganizationDeniedError);
  });

  it("allows only the exact target tenant",()=>{
    const context=supportContext();
    expect(()=>requireSupportTargetOrganization(context,context.targetOrganizationId)).not.toThrow();
  });

  it("denies support operations without the explicitly required capability",()=>{
    const context=supportContext({capabilities:["support.tenant.read"]});
    expect(()=>requireSupportCapability(context,"support.tenant.safe_write")).toThrow(SupportCapabilityDeniedError);
  });

  it("centralizes active session, target tenant, and capability checks for support-aware tenant routes",()=>{
    expect(supportAuth).toContain("authenticateSupportTenantRequestForOrganization");
    expect(supportAuth).toContain("authenticateSupportTenantRequest(request)");
    expect(supportAuth).toContain("requireSupportTargetOrganization(authenticated.support, organizationId)");
    expect(supportAuth).toContain("requireSupportCapability(authenticated.support, capability)");
  });

  it("maps a wrong-target tenant decision to HTTP 403 rather than leaking target information",()=>{
    expect(supportApi).toContain("SupportTargetOrganizationDeniedError");
    expect(supportApi).toContain('{ error: "Support access denied" }, { status: 403 }');
  });

  it("preserves ordinary tenant authorization without platform/support/super-admin bypass semantics",()=>{
    expect(tenantAuthorization).not.toMatch(/platform|support|super.?admin|bypass/i);
  });
});
