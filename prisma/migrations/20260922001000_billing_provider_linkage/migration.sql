-- Provider-neutral commercial billing linkage and verified-event observations.
-- External provider IDs never become Trace QMS record identity.

CREATE TYPE "BillingProviderEntityType" AS ENUM ('CUSTOMER','SUBSCRIPTION');

CREATE TABLE "BillingProviderLink" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "entityType" "BillingProviderEntityType" NOT NULL,
  "customerAccountId" UUID REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT,
  "subscriptionId" UUID REFERENCES "Subscription"("id") ON DELETE RESTRICT,
  "providerObjectId" TEXT NOT NULL,
  "createdByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "createdByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ,
  "revokedByIdentityId" UUID REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "revokedByMembershipId" UUID REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "revocationReason" TEXT,
  CONSTRAINT "BillingProviderLink_entity_target_check" CHECK (
    ("entityType"='CUSTOMER' AND "customerAccountId" IS NOT NULL AND "subscriptionId" IS NULL)
    OR
    ("entityType"='SUBSCRIPTION' AND "subscriptionId" IS NOT NULL AND "customerAccountId" IS NULL)
  )
);

CREATE UNIQUE INDEX "BillingProviderLink_active_provider_object_key"
  ON "BillingProviderLink" ("connectionId","entityType","providerObjectId")
  WHERE "revokedAt" IS NULL;

CREATE UNIQUE INDEX "BillingProviderLink_active_customer_key"
  ON "BillingProviderLink" ("connectionId","customerAccountId")
  WHERE "revokedAt" IS NULL AND "customerAccountId" IS NOT NULL;

CREATE UNIQUE INDEX "BillingProviderLink_active_subscription_key"
  ON "BillingProviderLink" ("connectionId","subscriptionId")
  WHERE "revokedAt" IS NULL AND "subscriptionId" IS NOT NULL;

CREATE TABLE "BillingProviderEventObservation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "receiptId" UUID NOT NULL UNIQUE REFERENCES "PlatformInboundWebhookReceipt"("id") ON DELETE RESTRICT,
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "providerEventId" TEXT,
  "eventType" TEXT NOT NULL,
  "providerObjectId" TEXT,
  "linkedBillingProviderLinkId" UUID REFERENCES "BillingProviderLink"("id") ON DELETE RESTRICT,
  "payloadSha256" TEXT NOT NULL,
  "observedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingProviderEventObservation_sha256_format" CHECK ("payloadSha256" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "BillingProviderEventObservation_connection_observed_idx"
  ON "BillingProviderEventObservation" ("connectionId","observedAt" DESC);

CREATE FUNCTION prevent_billing_provider_event_observation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BillingProviderEventObservation rows are append-only';
END;
$$;

CREATE TRIGGER "BillingProviderEventObservation_no_update_delete"
BEFORE UPDATE OR DELETE ON "BillingProviderEventObservation"
FOR EACH ROW EXECUTE FUNCTION prevent_billing_provider_event_observation_mutation();
