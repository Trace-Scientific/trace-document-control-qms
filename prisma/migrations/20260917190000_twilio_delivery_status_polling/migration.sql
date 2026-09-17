-- PR 22: Twilio missed-callback recovery and delivery-status monitoring.
-- Provider polling is observation/reconciliation only; it must never authorize an automatic resend.

ALTER TABLE "PlatformIntegrationDelivery"
  ADD COLUMN "providerStatusCheckedAt" TIMESTAMPTZ,
  ADD COLUMN "providerStatusCheckCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerStatusError" TEXT;

ALTER TABLE "PlatformIntegrationDelivery"
  ADD CONSTRAINT "PlatformIntegrationDelivery_provider_status_check_count_check"
    CHECK ("providerStatusCheckCount" >= 0),
  ADD CONSTRAINT "PlatformIntegrationDelivery_provider_status_error_check"
    CHECK ("providerStatusError" IS NULL OR char_length("providerStatusError") <= 500);

CREATE INDEX "PlatformIntegrationDelivery_provider_status_poll_idx"
  ON "PlatformIntegrationDelivery"("status","providerStatusCheckedAt","createdAt");
