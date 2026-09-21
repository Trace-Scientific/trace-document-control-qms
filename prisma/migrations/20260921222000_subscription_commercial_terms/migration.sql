-- Versioned commercial terms for subscription plan versions.
-- Pricing remains platform configuration and does not alter tenant RBAC or regulated records.

CREATE TYPE "BillingCadence" AS ENUM ('MONTHLY','ANNUAL','CUSTOM');

ALTER TABLE "PlanVersion"
  ADD COLUMN "billingCadence" "BillingCadence",
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "baseAmountCents" INTEGER,
  ADD COLUMN "includedFullUsers" INTEGER,
  ADD COLUMN "additionalUserRateCents" INTEGER,
  ADD COLUMN "storageAllowanceGb" INTEGER,
  ADD COLUMN "commercialMetadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "PlanVersion"
  ADD CONSTRAINT "PlanVersion_currency_format_check"
    CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "PlanVersion_base_amount_check"
    CHECK ("baseAmountCents" IS NULL OR "baseAmountCents" >= 0),
  ADD CONSTRAINT "PlanVersion_included_users_check"
    CHECK ("includedFullUsers" IS NULL OR "includedFullUsers" >= 0),
  ADD CONSTRAINT "PlanVersion_additional_user_rate_check"
    CHECK ("additionalUserRateCents" IS NULL OR "additionalUserRateCents" >= 0),
  ADD CONSTRAINT "PlanVersion_storage_allowance_check"
    CHECK ("storageAllowanceGb" IS NULL OR "storageAllowanceGb" >= 0);

CREATE FUNCTION validate_active_plan_version_commercial_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'ACTIVE' AND OLD."status" = 'DRAFT' THEN
    IF NEW."billingCadence" IS NULL
      OR NEW."currency" IS NULL
      OR NEW."baseAmountCents" IS NULL
      OR NEW."includedFullUsers" IS NULL THEN
      RAISE EXCEPTION 'Active PlanVersion requires billing cadence, currency, base amount, and included full users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PlanVersion_require_commercial_terms_on_activate"
BEFORE UPDATE OF "status" ON "PlanVersion"
FOR EACH ROW EXECUTE FUNCTION validate_active_plan_version_commercial_terms();
