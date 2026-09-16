-- PR 10: vendor-neutral platform integration framework.
-- Provider credentials are referenced by opaque external secret references; secret values are not stored here.

CREATE TYPE "PlatformIntegrationConnectionStatus" AS ENUM ('DRAFT','ACTIVE','SUSPENDED','REVOKED');
CREATE TYPE "PlatformIntegrationDeliveryStatus" AS ENUM ('PENDING','PROCESSING','RETRY','SUCCEEDED','DEAD_LETTER');
CREATE TYPE "PlatformInboundReceiptStatus" AS ENUM ('RECEIVED','VERIFIED','NORMALIZED','REJECTED');

CREATE TABLE "PlatformIntegrationConnection" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "adapterKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "PlatformIntegrationConnectionStatus" NOT NULL DEFAULT 'DRAFT',
  "credentialRef" TEXT,
  "configuration" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "createdByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlatformIntegrationConnection_status_idx" ON "PlatformIntegrationConnection"("status","adapterKey");

CREATE TABLE "PlatformIntegrationDelivery" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "correlationId" UUID,
  "status" "PlatformIntegrationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMPTZ,
  "claimedBy" TEXT,
  "lastAttemptAt" TIMESTAMPTZ,
  "deliveredAt" TIMESTAMPTZ,
  "deadLetteredAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformIntegrationDelivery_attempt_check" CHECK ("attemptCount" >= 0 AND "attemptCount" <= 5),
  CONSTRAINT "PlatformIntegrationDelivery_state_check" CHECK (
    (("status"='PROCESSING') = ("claimedAt" IS NOT NULL AND "claimedBy" IS NOT NULL))
    AND (("status"='SUCCEEDED') = ("deliveredAt" IS NOT NULL))
    AND (("status"='DEAD_LETTER') = ("deadLetteredAt" IS NOT NULL))
  )
);
CREATE UNIQUE INDEX "PlatformIntegrationDelivery_connection_idempotency_key" ON "PlatformIntegrationDelivery"("connectionId","idempotencyKey");
CREATE INDEX "PlatformIntegrationDelivery_work_idx" ON "PlatformIntegrationDelivery"("status","availableAt","createdAt");

CREATE TABLE "PlatformInboundWebhookReceipt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "idempotencyKey" TEXT NOT NULL,
  "providerEventId" TEXT,
  "signatureVersion" TEXT,
  "rawBodySha256" TEXT NOT NULL,
  "status" "PlatformInboundReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
  "correlationId" UUID,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMPTZ,
  "normalizedAt" TIMESTAMPTZ,
  "rejectionReason" TEXT
);
CREATE UNIQUE INDEX "PlatformInboundWebhookReceipt_connection_idempotency_key" ON "PlatformInboundWebhookReceipt"("connectionId","idempotencyKey");
CREATE INDEX "PlatformInboundWebhookReceipt_status_idx" ON "PlatformInboundWebhookReceipt"("status","receivedAt");

CREATE TABLE "PlatformIntegrationNormalizedEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "receiptId" UUID NOT NULL REFERENCES "PlatformInboundWebhookReceipt"("id") ON DELETE RESTRICT,
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "correlationId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlatformIntegrationNormalizedEvent_connection_created_idx" ON "PlatformIntegrationNormalizedEvent"("connectionId","createdAt" DESC);

CREATE FUNCTION prevent_platform_integration_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Platform integration history rows are append-only'; END;
$$;
CREATE TRIGGER "PlatformInboundWebhookReceipt_no_delete" BEFORE DELETE ON "PlatformInboundWebhookReceipt" FOR EACH ROW EXECUTE FUNCTION prevent_platform_integration_history_mutation();
CREATE TRIGGER "PlatformIntegrationNormalizedEvent_no_update_delete" BEFORE UPDATE OR DELETE ON "PlatformIntegrationNormalizedEvent" FOR EACH ROW EXECUTE FUNCTION prevent_platform_integration_history_mutation();
