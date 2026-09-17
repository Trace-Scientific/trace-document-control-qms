-- PR 19: provider delivery idempotency and reconciliation hardening.
-- Ambiguous provider outcomes must not be blindly replayed.

ALTER TYPE "PlatformIntegrationDeliveryStatus" ADD VALUE 'RECONCILIATION_REQUIRED';

ALTER TABLE "PlatformIntegrationDelivery"
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "providerObjectId" TEXT,
  ADD COLUMN "providerOutcome" TEXT,
  ADD COLUMN "reconciliationReason" TEXT,
  ADD COLUMN "reconciledAt" TIMESTAMPTZ,
  ADD COLUMN "reconciledByIdentityId" UUID REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  ADD COLUMN "reconciledByMembershipId" UUID REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT;

ALTER TABLE "PlatformIntegrationDelivery"
  ADD CONSTRAINT "PlatformIntegrationDelivery_provider_request_check"
    CHECK ("providerRequestId" IS NULL OR char_length("providerRequestId") <= 500),
  ADD CONSTRAINT "PlatformIntegrationDelivery_provider_object_check"
    CHECK ("providerObjectId" IS NULL OR char_length("providerObjectId") <= 500),
  ADD CONSTRAINT "PlatformIntegrationDelivery_provider_outcome_check"
    CHECK ("providerOutcome" IS NULL OR char_length("providerOutcome") <= 160),
  ADD CONSTRAINT "PlatformIntegrationDelivery_reconciliation_reason_check"
    CHECK ("reconciliationReason" IS NULL OR char_length("reconciliationReason") <= 1000),
  ADD CONSTRAINT "PlatformIntegrationDelivery_reconciled_actor_check"
    CHECK (("reconciledAt" IS NULL) = ("reconciledByIdentityId" IS NULL AND "reconciledByMembershipId" IS NULL));

-- This is intentionally not a partial index using the newly-added enum value in the
-- same migration. The status-leading index still supports the reconciliation queue.
CREATE INDEX "PlatformIntegrationDelivery_reconciliation_idx"
  ON "PlatformIntegrationDelivery"("status","lastAttemptAt","createdAt");
