-- Immutable customer-specific contracted commercial terms on subscriptions.
-- Null fields inherit the immutable referenced PlanVersion terms.

ALTER TABLE "Subscription"
  ADD COLUMN "contractBillingCadence" "BillingCadence",
  ADD COLUMN "contractCurrency" TEXT,
  ADD COLUMN "contractBaseAmountCents" INTEGER,
  ADD COLUMN "contractIncludedFullUsers" INTEGER,
  ADD COLUMN "contractAdditionalUserRateCents" INTEGER,
  ADD COLUMN "contractStorageAllowanceGb" INTEGER,
  ADD COLUMN "contractTermsNote" TEXT;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_contract_currency_format_check"
    CHECK ("contractCurrency" IS NULL OR "contractCurrency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Subscription_contract_base_amount_check"
    CHECK ("contractBaseAmountCents" IS NULL OR "contractBaseAmountCents" >= 0),
  ADD CONSTRAINT "Subscription_contract_included_users_check"
    CHECK ("contractIncludedFullUsers" IS NULL OR "contractIncludedFullUsers" >= 0),
  ADD CONSTRAINT "Subscription_contract_additional_user_rate_check"
    CHECK ("contractAdditionalUserRateCents" IS NULL OR "contractAdditionalUserRateCents" >= 0),
  ADD CONSTRAINT "Subscription_contract_storage_allowance_check"
    CHECK ("contractStorageAllowanceGb" IS NULL OR "contractStorageAllowanceGb" >= 0);

CREATE FUNCTION prevent_subscription_contract_terms_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."contractBillingCadence" IS DISTINCT FROM NEW."contractBillingCadence"
     OR OLD."contractCurrency" IS DISTINCT FROM NEW."contractCurrency"
     OR OLD."contractBaseAmountCents" IS DISTINCT FROM NEW."contractBaseAmountCents"
     OR OLD."contractIncludedFullUsers" IS DISTINCT FROM NEW."contractIncludedFullUsers"
     OR OLD."contractAdditionalUserRateCents" IS DISTINCT FROM NEW."contractAdditionalUserRateCents"
     OR OLD."contractStorageAllowanceGb" IS DISTINCT FROM NEW."contractStorageAllowanceGb"
     OR OLD."contractTermsNote" IS DISTINCT FROM NEW."contractTermsNote" THEN
    RAISE EXCEPTION 'Subscription contracted commercial terms are immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Subscription_contract_terms_immutable"
BEFORE UPDATE ON "Subscription"
FOR EACH ROW EXECUTE FUNCTION prevent_subscription_contract_terms_mutation();
