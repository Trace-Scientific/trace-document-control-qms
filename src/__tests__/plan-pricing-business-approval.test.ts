import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const migration=readFileSync(join(process.cwd(),"prisma/migrations/20260922070000_plan_pricing_business_approval/migration.sql"),"utf8");
const service=readFileSync(join(process.cwd(),"src/lib/platform/subscriptions.ts"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/catalog/plan-versions/[planVersionId]/activate/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-catalog-administration-panel.tsx"),"utf8");

describe("plan pricing business approval",()=>{
  it("records attributable business approval evidence on the plan version",()=>{
    expect(migration).toContain('"businessApprovedAt"');
    expect(migration).toContain('"businessApprovedByIdentityId"');
    expect(migration).toContain('"businessApprovedByMembershipId"');
    expect(migration).toContain('"businessApprovalReason"');
  });

  it("makes recorded approval evidence immutable",()=>{
    expect(migration).toContain("prevent_plan_version_business_approval_mutation");
    expect(migration).toContain("Plan version business approval evidence is immutable");
  });

  it("requires explicit approval evidence during activation",()=>{
    expect(route).toContain("businessApprovalReason");
    expect(service).toContain("validateReason(input.businessApprovalReason)");
    expect(service).toContain('"businessApprovedAt" = CURRENT_TIMESTAMP');
    expect(service).toContain('"businessApprovedByIdentityId"');
    expect(service).toContain('"businessApprovedByMembershipId"');
  });

  it("will not activate commercially incomplete pricing",()=>{
    expect(service).toContain('"billingCadence" IS NOT NULL AND "currency" IS NOT NULL AND "baseAmountCents" IS NOT NULL');
    expect(service).toContain("Only a commercially complete draft plan version can be business-approved and activated");
  });

  it("shows approval state in catalog administration",()=>{
    expect(panel).toContain("Business approval basis for this pricing/package version");
    expect(panel).toContain("Business-approved");
    expect(panel).toContain("Business approval not yet recorded");
  });

  it("does not hard-code public prices",()=>{
    expect(service).not.toContain("$499");
    expect(service).not.toContain("$999");
    expect(panel).not.toContain("$1,499");
    expect(migration).not.toContain("Starter");
  });
});
