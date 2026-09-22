-- First-class commercial customer profile fields.
-- These fields remain platform control-plane data and never become tenant QMS record identity.

ALTER TABLE "CustomerAccount"
  ADD COLUMN "leadSource" TEXT,
  ADD COLUMN "contractAt" TIMESTAMPTZ,
  ADD COLUMN "renewalAt" TIMESTAMPTZ,
  ADD COLUMN "onboardingAmountCents" INTEGER,
  ADD COLUMN "discountBasisPoints" INTEGER;

ALTER TABLE "CustomerAccount"
  ADD CONSTRAINT "CustomerAccount_onboarding_amount_check"
    CHECK ("onboardingAmountCents" IS NULL OR "onboardingAmountCents" >= 0),
  ADD CONSTRAINT "CustomerAccount_discount_basis_points_check"
    CHECK ("discountBasisPoints" IS NULL OR ("discountBasisPoints" >= 0 AND "discountBasisPoints" <= 10000)),
  ADD CONSTRAINT "CustomerAccount_renewal_after_contract_check"
    CHECK ("renewalAt" IS NULL OR "contractAt" IS NULL OR "renewalAt" > "contractAt");

CREATE INDEX "CustomerAccount_renewalAt_idx" ON "CustomerAccount" ("renewalAt");
