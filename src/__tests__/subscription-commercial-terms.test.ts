import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260921222000_subscription_commercial_terms/migration.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/platform/subscriptions.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/platform/catalog/plan-versions/[planVersionId]/commercial-terms/route.ts"), "utf8");

describe("subscription commercial terms", () => {
  it("adds versioned cadence, pricing, user, storage, and metadata fields", () => {
    expect(migration).toContain('CREATE TYPE "BillingCadence"');
    expect(migration).toContain('"billingCadence" "BillingCadence"');
    expect(migration).toContain('"baseAmountCents" INTEGER');
    expect(migration).toContain('"includedFullUsers" INTEGER');
    expect(migration).toContain('"additionalUserRateCents" INTEGER');
    expect(migration).toContain('"storageAllowanceGb" INTEGER');
    expect(migration).toContain('"commercialMetadata" JSONB');
  });

  it("requires minimum commercial terms before plan activation", () => {
    expect(migration).toContain("Active PlanVersion requires billing cadence, currency, base amount, and included full users");
    expect(migration).toContain('"PlanVersion_require_commercial_terms_on_activate"');
  });

  it("allows commercial terms to change only while the plan version is draft", () => {
    expect(service).toContain("async setDraftCommercialTerms");
    expect(service).toContain('AND "status"=\'DRAFT\'');
    expect(service).toContain("Commercial terms can only be changed on a draft plan version");
    expect(service).toContain('"catalog.plan_version.commercial_terms.set"');
  });

  it("keeps terms configurable rather than hard-coding public prices", () => {
    expect(service).not.toMatch(/49900|99900|149900|249900/);
    expect(service).toContain("baseAmountCents");
    expect(service).toContain("includedFullUsers");
    expect(service).toContain("additionalUserRateCents");
  });

  it("exposes a platform-authorized draft commercial terms API", () => {
    expect(route).toContain("authenticatePlatformRequest");
    expect(route).toContain('z.enum(["MONTHLY","ANNUAL","CUSTOM"])');
    expect(route).toContain("setDraftCommercialTerms");
  });
});