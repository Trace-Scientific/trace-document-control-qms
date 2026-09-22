-- Commercial pricing analysis remains platform control-plane data.
-- It does not define public pricing or tenant QMS authorization.

CREATE TABLE "PlanCostAssumption" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planVersionId" UUID NOT NULL UNIQUE REFERENCES "PlanVersion"("id") ON DELETE RESTRICT,
  "infrastructureMonthlyCents" INTEGER NOT NULL DEFAULT 0,
  "supportMonthlyCents" INTEGER NOT NULL DEFAULT 0,
  "operationsMonthlyCents" INTEGER NOT NULL DEFAULT 0,
  "paymentFeeBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "paymentFixedFeeCents" INTEGER NOT NULL DEFAULT 0,
  "onboardingCostCents" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "assumptionDate" DATE NOT NULL,
  "createdByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "createdByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PlanCostAssumption_nonnegative_costs_check" CHECK (
    "infrastructureMonthlyCents" >= 0 AND "supportMonthlyCents" >= 0 AND
    "operationsMonthlyCents" >= 0 AND "paymentFixedFeeCents" >= 0 AND
    "onboardingCostCents" >= 0
  ),
  CONSTRAINT "PlanCostAssumption_payment_bps_check" CHECK ("paymentFeeBasisPoints" BETWEEN 0 AND 10000)
);

CREATE TABLE "CompetitivePriceObservation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "competitorName" TEXT NOT NULL,
  "offeringName" TEXT,
  "billingCadence" "BillingCadence",
  "currency" TEXT,
  "amountCents" INTEGER,
  "includedUsers" INTEGER,
  "sourceLabel" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "observedOn" DATE NOT NULL,
  "notes" TEXT,
  "createdByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "createdByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitivePriceObservation_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CompetitivePriceObservation_amount_check" CHECK ("amountCents" IS NULL OR "amountCents" >= 0),
  CONSTRAINT "CompetitivePriceObservation_users_check" CHECK ("includedUsers" IS NULL OR "includedUsers" >= 0)
);

CREATE INDEX "CompetitivePriceObservation_observedOn_idx" ON "CompetitivePriceObservation" ("observedOn" DESC);
