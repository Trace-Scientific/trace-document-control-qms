import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const migration=readFileSync(join(process.cwd(),"prisma/migrations/20260922042000_subscription_contracted_terms/migration.sql"),"utf8");
const service=readFileSync(join(process.cwd(),"src/lib/platform/subscriptions.ts"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/subscriptions/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-subscriptions-panel.tsx"),"utf8");
const reporting=readFileSync(join(process.cwd(),"src/lib/platform/notifications-reporting.ts"),"utf8");

describe("subscription contracted terms",()=>{
  it("adds first-class customer-specific commercial fields",()=>{
    expect(migration).toContain('"contractBillingCadence" "BillingCadence"');
    expect(migration).toContain('"contractCurrency" TEXT');
    expect(migration).toContain('"contractBaseAmountCents" INTEGER');
    expect(migration).toContain('"contractIncludedFullUsers" INTEGER');
    expect(migration).toContain('"contractAdditionalUserRateCents" INTEGER');
    expect(migration).toContain('"contractStorageAllowanceGb" INTEGER');
  });

  it("makes contracted terms immutable after subscription creation",()=>{
    expect(migration).toContain("prevent_subscription_contract_terms_mutation");
    expect(migration).toContain("Subscription contracted commercial terms are immutable after creation");
    expect(migration).toContain('CREATE TRIGGER "Subscription_contract_terms_immutable"');
  });

  it("supports inherited plan terms or explicit contracted overrides",()=>{
    expect(service).toContain('COALESCE(s."contractBillingCadence",pv."billingCadence")');
    expect(service).toContain('COALESCE(s."contractBaseAmountCents",pv."baseAmountCents")');
    expect(panel).toContain("Customer-specific contracted / grandfathered terms");
    expect(panel).toContain("Inherits immutable plan-version terms");
  });

  it("validates and audits contracted terms at creation",()=>{
    expect(route).toContain("contractBaseAmountCents");
    expect(route).toContain("contractIncludedFullUsers");
    expect(service).toContain("validateContractedTerms(input)");
    expect(service).toContain("contractedTerms");
    expect(service).toContain('"subscription.created"');
  });

  it("uses effective contracted terms for recurring revenue reporting",()=>{
    expect(reporting).toContain('COALESCE(s."contractCurrency",pv."currency")');
    expect(reporting).toContain('COALESCE(s."contractBillingCadence",pv."billingCadence")');
    expect(reporting).toContain('COALESCE(s."contractBaseAmountCents",pv."baseAmountCents")');
  });

  it("does not alter tenant RBAC or governed tenant records",()=>{
    expect(service).not.toContain('"RolePermission"');
    expect(service).not.toContain('"UserRole"');
    expect(migration).not.toContain('"Document"');
    expect(migration).not.toContain('"AuditEvent"');
  });
});
