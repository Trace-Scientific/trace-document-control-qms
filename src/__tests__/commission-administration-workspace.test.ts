import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/sales-commissions.ts"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/commissions/workspace/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-commissions-panel.tsx"),"utf8");
const shell=readFileSync(join(process.cwd(),"src/components/platform-administration-shell.tsx"),"utf8");

describe("commission administration workspace",()=>{
  it("requires commission read permission for the workspace read model",()=>{
    expect(service).toContain("async commissionWorkspace");
    expect(service).toContain('permission: "platform.commission.read"');
    expect(route).toContain("authenticatePlatformRequest");
  });

  it("uses existing governed mutation APIs for plan/rule/accrual lifecycle",()=>{
    expect(panel).toContain("/api/platform/commissions/plans");
    expect(panel).toContain("/rules");
    expect(panel).toContain("/activate");
    expect(panel).toContain("/api/platform/commissions/accruals");
    expect(panel).toContain("/transition");
    expect(panel).toContain("/adjustments");
    expect(panel).toContain("/payment");
  });

  it("keeps configuration draft-only until explicit activation",()=>{
    expect(panel).toContain('version.status==="DRAFT"');
    expect(panel).toContain("Activate this commission plan version?");
    expect(service).toContain("Rules may be added only to draft plan versions");
    expect(service).toContain("At least one commission rule is required before activation");
  });

  it("preserves reproducible accrual evidence and optimistic locking",()=>{
    expect(service).toContain('"ruleSnapshot"');
    expect(service).toContain("expectedLockVersion");
    expect(panel).toContain("preserve the applied rule snapshot");
    expect(panel).toContain("expectedLockVersion:item.lockVersion");
  });

  it("keeps read and manage permissions separate",()=>{
    expect(shell).toContain('canManage={permissions.includes("platform.commission.manage")}');
    expect(panel).toContain("canManage");
  });

  it("supports the governed accrual lifecycle and separate monetary evidence",()=>{
    expect(panel).toContain("Mark earned");
    expect(panel).toContain("Approve");
    expect(panel).toContain("Adjustment / reversal");
    expect(panel).toContain("Record payment");
    expect(service).toContain('"CommissionAdjustment"');
    expect(service).toContain('"CommissionPayment"');
    expect(service).toContain('"CommissionAccrualEvent"');
  });
});
