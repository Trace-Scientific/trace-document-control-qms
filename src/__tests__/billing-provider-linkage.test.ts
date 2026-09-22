import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const migration=readFileSync(join(process.cwd(),"prisma/migrations/20260922001000_billing_provider_linkage/migration.sql"),"utf8");
const service=readFileSync(join(process.cwd(),"src/lib/platform/billing-provider-linkage.ts"),"utf8");
const inbound=readFileSync(join(process.cwd(),"src/lib/platform/integration-inbound.ts"),"utf8");
const api=readFileSync(join(process.cwd(),"src/app/api/platform/billing-provider-links/route.ts"),"utf8");

describe("billing provider linkage and observations",()=>{
  it("keeps provider identity separate from internal customer/subscription identity",()=>{
    expect(migration).toContain('"providerObjectId" TEXT NOT NULL');
    expect(migration).toContain('"customerAccountId" UUID');
    expect(migration).toContain('"subscriptionId" UUID');
    expect(migration).toContain('"BillingProviderLink_entity_target_check"');
  });

  it("preserves link history through revocation instead of deletion",()=>{
    expect(migration).toContain('"revokedAt" TIMESTAMPTZ');
    expect(service).toContain('"revokedAt"=CURRENT_TIMESTAMP');
    expect(service).not.toContain('DELETE FROM "BillingProviderLink"');
  });

  it("records verified billing observations as append-only evidence",()=>{
    expect(migration).toContain('CREATE TABLE "BillingProviderEventObservation"');
    expect(migration).toContain('"BillingProviderEventObservation_no_update_delete"');
    expect(service).toContain("recordVerifiedStripeBillingObservation");
    expect(inbound).toContain("recordVerifiedStripeBillingObservation");
  });

  it("does not mutate authoritative subscription state from Stripe webhook observation",()=>{
    const fn=service.slice(service.indexOf("export async function recordVerifiedStripeBillingObservation"));
    expect(fn).not.toContain('UPDATE "Subscription"');
    expect(fn).not.toContain('UPDATE "EntitlementOverride"');
    expect(fn).toContain('INSERT INTO "BillingProviderEventObservation"');
  });

  it("requires platform integration authority and reviewed Stripe adapter linkage",()=>{
    expect(service).toContain('permission: "platform.integration.manage"');
    expect(service).toContain('adapterKey!=="stripe.billing"');
    expect(api).toContain("authenticatePlatformRequest");
  });

  it("validates provider object identity by linked entity type",()=>{
    expect(service).toContain("/^cus_[A-Za-z0-9]+$/");
    expect(service).toContain("/^sub_[A-Za-z0-9]+$/");
  });
});
