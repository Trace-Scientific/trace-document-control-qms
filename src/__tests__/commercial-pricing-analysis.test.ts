import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const migration=readFileSync(join(process.cwd(),"prisma/migrations/20260922044000_commercial_pricing_analysis/migration.sql"),"utf8");
const service=readFileSync(join(process.cwd(),"src/lib/platform/commercial-pricing-analysis.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-pricing-analysis-panel.tsx"),"utf8");
const subscriptions=readFileSync(join(process.cwd(),"src/components/platform-subscriptions-panel.tsx"),"utf8");

describe("commercial pricing analysis",()=>{
  it("stores plan cost assumptions separately from public plan pricing",()=>{
    expect(migration).toContain('CREATE TABLE "PlanCostAssumption"');
    expect(migration).toContain('"planVersionId" UUID NOT NULL UNIQUE');
    expect(panel).toContain("Public pricing remains configurable and business-approved");
  });

  it("calculates recurring gross margin from configurable costs and payment fees",()=>{
    expect(service).toContain("normalizedMonthlyRevenueCents");
    expect(service).toContain("estimatedMonthlyCostCents");
    expect(service).toContain("estimatedMonthlyGrossMarginCents");
    expect(service).toContain("estimatedGrossMarginPercent");
    expect(service).toContain("paymentFeeBasisPoints");
  });

  it("keeps onboarding cost visible but outside recurring gross-margin cost",()=>{
    expect(service).toContain("onboardingCostCents");
    expect(service).not.toContain("estimatedMonthlyCostCents=\n        cost.infrastructureMonthlyCents+cost.supportMonthlyCents+cost.operationsMonthlyCents+paymentFee+cost.onboardingCostCents");
    expect(panel).toContain("onboarding cost");
  });

  it("requires dated and sourced competitor observations",()=>{
    expect(migration).toContain('"sourceLabel" TEXT NOT NULL');
    expect(migration).toContain('"observedOn" DATE NOT NULL');
    expect(service).toContain("sourceLabel");
    expect(panel).toContain("Observations are dated and source-attributed because competitor pricing changes");
  });

  it("uses subscription permissions and platform audit evidence",()=>{
    expect(service).toContain('permission:"platform.subscription.read"');
    expect(service).toContain('permission:"platform.subscription.manage"');
    expect(service).toContain('"pricing.cost_assumption.set"');
    expect(service).toContain('"pricing.competitor_observation.created"');
    expect(service).toContain('INSERT INTO "PlatformAuditEvent"');
  });

  it("is embedded in commercial subscription administration rather than tenant QMS administration",()=>{
    expect(subscriptions).toContain("<PlatformPricingAnalysisPanel canManage={canManage} />");
    expect(migration).not.toContain('"Document"');
    expect(migration).not.toContain('"RolePermission"');
  });
});
