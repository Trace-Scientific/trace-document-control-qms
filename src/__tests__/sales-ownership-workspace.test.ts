import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/sales-commissions.ts"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/sales/workspace/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-sales-panel.tsx"),"utf8");
const shell=readFileSync(join(process.cwd(),"src/components/platform-administration-shell.tsx"),"utf8");

describe("sales ownership administration workspace",()=>{
  it("requires sales read permission for the workspace model",()=>{
    expect(service).toContain("async salesWorkspace");
    expect(service).toContain('permission: "platform.sales.read"');
    expect(route).toContain("authenticatePlatformRequest");
  });

  it("returns only active platform identities for representative linkage",()=>{
    expect(service).toContain('FROM "PlatformIdentity"');
    expect(service).toContain('WHERE pi."status"=\'ACTIVE\'');
  });

  it("uses existing governed representative and assignment APIs",()=>{
    expect(panel).toContain("/api/platform/sales/representatives");
    expect(panel).toContain("/api/platform/sales/assignments");
    expect(panel).toContain("Reason for creating sales representative");
    expect(panel).toContain("Reason for assigning this customer");
  });

  it("keeps management separate from read access",()=>{
    expect(shell).toContain('canManage={permissions.includes("platform.sales.manage")}');
    expect(panel).toContain("canManage");
  });

  it("preserves the tenant-access boundary and historical ownership model",()=>{
    expect(panel).toContain("Sales ownership does not grant tenant QMS access");
    expect(panel).toContain("Overlapping ownership for the same customer is rejected");
    expect(panel).toContain("Historical ownership remains preserved");
  });
});
