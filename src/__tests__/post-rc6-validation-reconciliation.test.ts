import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const trace=readFileSync(join(process.cwd(),"docs/validation/traceability-matrix-post-rc6.md"),"utf8");
const uat=readFileSync(join(process.cwd(),"docs/validation/critical-workflow-uat-post-rc6.md"),"utf8");
const finalReview=readFileSync(join(process.cwd(),"docs/validation/final-software-completeness-review.md"),"utf8");

describe("post-rc6 validation reconciliation",()=>{
  it("extends rather than renumbers prior validation requirements",()=>{
    expect(trace).toContain("UR-026");
    expect(trace).toContain("UR-033");
    expect(trace).not.toContain("| UR-025 |");
    expect(uat).toContain("UAT-40");
    expect(uat).toContain("UAT-57");
    expect(uat).not.toContain("| UAT-39 |");
  });

  it("covers the material post-rc6 control families",()=>{
    for(const text of [
      "Controlled Help and User Manual",
      "Platform identities, memberships, roles, and permissions",
      "Commercial subscriptions and entitlements",
      "contracted/grandfathered commercial terms",
      "Sales ownership and commission administration",
      "Cross-tenant Technical Support access",
      "customer-only accountable actions",
      "Platform Audit and System Health",
    ]) expect(trace).toContain(text);
  });

  it("includes explicit negative/fail-closed UAT cases",()=>{
    expect(uat).toContain("Attempt to grant or obtain platform privileges through tenant Administration");
    expect(uat).toContain("Wrong-tenant, expired, revoked, or missing session fails closed");
    expect(uat).toContain("Customer-only accountable action is denied");
    expect(uat).toContain("sales ownership grants no tenant QMS access");
  });

  it("preserves validation and AWS boundaries",()=>{
    expect(trace).toContain("do not approve any AWS APPLY");
    expect(uat).toContain("does not independently establish production approval");
    expect(finalReview).toContain("AWS remains **PLAN-only**");
  });
});
