import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/sales-commissions.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-sales-panel.tsx"),"utf8");

describe("sales representative scoping",()=>{
  it("keeps platform.sales.read as the base read permission",()=>{
    expect(service).toContain('permission: "platform.sales.read"');
  });

  it("grants cross-sales visibility only when platform.sales.manage is present",()=>{
    expect(service).toContain('context.grants.includes("platform.sales.manage")');
    expect(service).toContain('scope: canManage ? "ADMIN" : "SELF"');
  });

  it("self-scopes representatives and assignments by platform identity for read-only users",()=>{
    expect(service).toContain('sr."platformIdentityId"=\${context.platformIdentityId}::uuid');
    expect(service).toContain('WHERE (\${canManage} OR sr."platformIdentityId"=\${context.platformIdentityId}::uuid)');
  });

  it("does not expose the active platform identity directory to read-only sales users",()=>{
    expect(service).toContain('canManage');
    expect(service).toContain('Promise.resolve([] as Array<{id:string;email:string;status:string}>)');
  });

  it("surfaces scope clearly in the Sales workspace",()=>{
    expect(panel).toContain("Administrative sales scope");
    expect(panel).toContain("Sales representative scope");
    expect(panel).toContain("only your linked representative profile and assigned customer accounts are visible");
  });

  it("preserves the tenant-access boundary",()=>{
    expect(panel).toContain("Sales ownership does not grant tenant QMS access");
    expect(service).not.toContain('"RolePermission"');
    expect(service).not.toContain('"UserRole"');
  });
});
