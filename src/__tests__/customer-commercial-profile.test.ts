import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const migration=readFileSync(join(process.cwd(),"prisma/migrations/20260922023000_customer_commercial_profile/migration.sql"),"utf8");
const service=readFileSync(join(process.cwd(),"src/lib/platform/customer-accounts.ts"),"utf8");
const createRoute=readFileSync(join(process.cwd(),"src/app/api/platform/customers/route.ts"),"utf8");
const updateRoute=readFileSync(join(process.cwd(),"src/app/api/platform/customers/[customerAccountId]/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-customers-panel.tsx"),"utf8");
const shell=readFileSync(join(process.cwd(),"src/components/platform-administration-shell.tsx"),"utf8");

describe("customer commercial profile",()=>{
  it("adds first-class typed commercial profile fields",()=>{
    expect(migration).toContain('"leadSource" TEXT');
    expect(migration).toContain('"contractAt" TIMESTAMPTZ');
    expect(migration).toContain('"renewalAt" TIMESTAMPTZ');
    expect(migration).toContain('"onboardingAmountCents" INTEGER');
    expect(migration).toContain('"discountBasisPoints" INTEGER');
  });

  it("validates money discount and renewal ordering",()=>{
    expect(migration).toContain('"CustomerAccount_onboarding_amount_check"');
    expect(migration).toContain('"CustomerAccount_discount_basis_points_check"');
    expect(migration).toContain('"CustomerAccount_renewal_after_contract_check"');
    expect(service).toContain("Renewal date must be after contract date");
    expect(service).toContain("Discount basis points must be between 0 and 10000");
  });

  it("exposes typed fields through governed create and update APIs",()=>{
    expect(createRoute).toContain("leadSource");
    expect(createRoute).toContain("onboardingAmountCents");
    expect(updateRoute).toContain("discountBasisPoints");
    expect(updateRoute).toContain("renewalAt");
    expect(service).toContain('"customer_account.updated"');
  });

  it("keeps subscription terms in the subscription domain rather than duplicating them",()=>{
    expect(migration).not.toContain('"planVersionId"');
    expect(migration).not.toContain('"billingCadence"');
    expect(migration).not.toContain('"subscriptionAmount');
    expect(panel).toContain("remain governed in Subscriptions & entitlements rather than duplicated here");
  });

  it("uses optimistic locking and reasoned platform updates",()=>{
    expect(panel).toContain("expectedLockVersion:customer.lockVersion");
    expect(panel).toContain("Reason for updating customer commercial profile");
    expect(service).toContain('permission: "platform.organization.manage"');
  });

  it("loads customer accounts for dependent workspaces without a Customers-tab prerequisite",()=>{
    expect(shell).toContain('["customers", "subscriptions", "sales"].includes(activeSection)');
    expect(shell).toContain("reloadCustomers");
  });
});
