import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/support-access.ts"),"utf8");
const workspace=readFileSync(join(process.cwd(),"src/lib/platform/support-access-workspace.ts"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/support/workspace/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/support-access-operations.tsx"),"utf8");
const page=readFileSync(join(process.cwd(),"src/app/support-access/page.tsx"),"utf8");

describe("controlled support access operations workspace",()=>{
  it("preserves two-person approval and requester-bound issuance",()=>{
    expect(service).toContain("Support access requests require approval by a different platform member");
    expect(service).toContain("Only the approved requester may issue the support session");
    expect(panel).toContain("A different authorized platform member must decide this request");
  });

  it("preserves bounded session duration and active expiry checks",()=>{
    expect(service).toContain("Support access duration must be between 5 and 240 minutes");
    expect(service).toContain('session.expiresAt.getTime() <= Date.now()');
    expect(panel).toContain("expires");
  });

  it("exposes permission-aware case request and session visibility",()=>{
    expect(workspace).toContain('context.grants.includes("platform.support.request")');
    expect(workspace).toContain('context.grants.includes("platform.support.approve")');
    expect(workspace).toContain('context.grants.includes("platform.support.access")');
    expect(workspace).toContain("currentMembershipId:context.platformMembershipId");
    expect(route).toContain("authenticatePlatformRequest");
    expect(route).toContain('"Cache-Control":"no-store"');
  });

  it("supports request approve deny assume exit revoke and case closure operations",()=>{
    expect(panel).toContain("/api/platform/support/requests");
    expect(panel).toContain("/decision");
    expect(panel).toContain("/api/platform/support/sessions");
    expect(panel).toContain("/revoke");
    expect(panel).toContain("/close");
    expect(panel).toContain("Request tenant access");
    expect(panel).toContain("Start support session");
    expect(panel).toContain("Exit support session");
  });

  it("keeps customer-only governed actions prohibited",()=>{
    expect(service).toContain("electronic_signature.create");
    expect(service).toContain("document.approve");
    expect(service).toContain("legal_hold.release");
    expect(service).toContain("security.role.manage");
    expect(service).toContain("Support access cannot perform customer-only action");
  });

  it("keeps support activity attributable across tenant and platform audit",()=>{
    expect(service).toContain('INSERT INTO "AuditEvent"');
    expect(service).toContain('INSERT INTO "PlatformAuditEvent"');
    expect(service).toContain("supportSessionId");
    expect(service).toContain("supportCaseId");
  });

  it("activates the workflow beneath the persistent support banner",()=>{
    expect(page).toContain("<SupportAccessBanner />");
    expect(page).toContain("<SupportAccessOperations />");
  });
});
