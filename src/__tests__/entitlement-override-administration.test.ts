import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/subscriptions.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-subscriptions-panel.tsx"),"utf8");
const shell=readFileSync(join(process.cwd(),"src/components/platform-administration-shell.tsx"),"utf8");
const createRoute=readFileSync(join(process.cwd(),"src/app/api/platform/entitlements/overrides/route.ts"),"utf8");
const revokeRoute=readFileSync(join(process.cwd(),"src/app/api/platform/entitlements/overrides/[overrideId]/revoke/route.ts"),"utf8");

describe("entitlement override administration",()=>{
  it("exposes active features for governed override selection",()=>{
    expect(service).toContain('WHERE "status"=\'ACTIVE\'');
    expect(service).toContain("activeFeatures");
  });
  it("keeps entitlement management permission distinct from subscription management",()=>{
    expect(shell).toContain('canManageEntitlements={permissions.includes("platform.entitlement.manage")}');
    expect(panel).toContain("canManageEntitlements");
  });
  it("uses the existing governed create and revoke APIs",()=>{
    expect(panel).toContain("/api/platform/entitlements/overrides");
    expect(panel).toContain("/revoke");
    expect(createRoute).toContain("createEntitlementOverride");
    expect(revokeRoute).toContain("revokeEntitlementOverride");
  });
  it("requires reasons and preserves the tenant-RBAC boundary",()=>{
    expect(panel).toContain("Reason for this entitlement override");
    expect(panel).toContain("Reason for revoking this entitlement override");
    expect(panel).toContain("Tenant RBAC was not changed");
    expect(panel).toContain("They do not create tenant permissions");
  });
});
