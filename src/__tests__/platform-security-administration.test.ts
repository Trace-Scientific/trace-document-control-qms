import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/security-administration.ts"),"utf8");
const workspace=readFileSync(join(process.cwd(),"src/app/api/platform/security/workspace/route.ts"),"utf8");
const roles=readFileSync(join(process.cwd(),"src/app/api/platform/security/roles/route.ts"),"utf8");
const perms=readFileSync(join(process.cwd(),"src/app/api/platform/security/roles/[roleId]/permissions/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-security-panel.tsx"),"utf8");
const shell=readFileSync(join(process.cwd(),"src/components/platform-administration-shell.tsx"),"utf8");

describe("platform security administration",()=>{
  it("requires platform security manage permission for read and mutation operations",()=>{
    expect(service).toContain('permission:"platform.security.manage"');
    expect(workspace).toContain("authenticatePlatformRequest");
    expect(roles).toContain("authenticatePlatformRequest");
    expect(perms).toContain("authenticatePlatformRequest");
  });

  it("keeps system roles bootstrap-controlled and read-only",()=>{
    expect(service).toContain("System platform roles are bootstrap-controlled and read-only");
    expect(panel).toContain("System roles are bootstrap-controlled and read-only here");
    expect(panel).toContain('role.systemRole?" · SYSTEM":""');
  });

  it("supports custom role creation and explicit permission sets",()=>{
    expect(service).toContain("async createRole");
    expect(service).toContain("async setRolePermissions");
    expect(service).toContain("replaceCustomRolePermissions");
    expect(panel).toContain("Create custom role");
    expect(panel).toContain("Edit permissions");
  });

  it("supports governed assignment and unassignment to existing active platform memberships",()=>{
    expect(service).toContain("async assignRole");
    expect(service).toContain("async unassignRole");
    expect(service).toContain("ensureActiveMembership");
    expect(panel).toContain("Assign custom role");
    expect(panel).toContain("Remove custom role");
  });

  it("writes platform audit evidence for security changes",()=>{
    expect(service).toContain('"platform.security.role_created"');
    expect(service).toContain('"platform.security.role_permissions_set"');
    expect(service).toContain('"platform.security.role_assigned"');
    expect(service).toContain('"platform.security.role_unassigned"');
    expect(service).toContain('INSERT INTO "PlatformAuditEvent"');
  });

  it("does not bridge platform roles to tenant authorization",()=>{
    expect(service).not.toContain('"RolePermission"');
    expect(service).not.toContain('"UserRole"');
    expect(panel).toContain("They do not grant tenant QMS permissions");
  });

  it("replaces the platform security placeholder",()=>{
    expect(shell).toContain("<PlatformSecurityPanel />");
    expect(shell).not.toContain("Platform security foundation");
  });
});
