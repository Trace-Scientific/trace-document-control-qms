-- Customer Account Foundation
-- Additive control-plane commercial customer layer. Existing tenant tables are not altered.

CREATE TYPE "CustomerAccountStatus" AS ENUM ('PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

CREATE TABLE "CustomerAccount" (
  "id" UUID NOT NULL,
  "organizationId" UUID,
  "accountCode" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "CustomerAccountStatus" NOT NULL DEFAULT 'PROSPECT',
  "commercialMetadata" JSONB NOT NULL DEFAULT '{}',
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAccount_accountCode_key" ON "CustomerAccount"("accountCode");
CREATE UNIQUE INDEX "CustomerAccount_organizationId_key" ON "CustomerAccount"("organizationId") WHERE "organizationId" IS NOT NULL;
CREATE INDEX "CustomerAccount_status_idx" ON "CustomerAccount"("status");
CREATE INDEX "CustomerAccount_displayName_idx" ON "CustomerAccount"("displayName");

ALTER TABLE "CustomerAccount"
  ADD CONSTRAINT "CustomerAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CustomerAccountStatusEvent" (
  "id" UUID NOT NULL,
  "customerAccountId" UUID NOT NULL,
  "fromStatus" "CustomerAccountStatus",
  "toStatus" "CustomerAccountStatus" NOT NULL,
  "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorIdentityId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" UUID,
  "correlationId" UUID,
  CONSTRAINT "CustomerAccountStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerAccountStatusEvent_customer_changed_idx" ON "CustomerAccountStatusEvent"("customerAccountId", "changedAt");
CREATE INDEX "CustomerAccountStatusEvent_correlation_idx" ON "CustomerAccountStatusEvent"("correlationId");

ALTER TABLE "CustomerAccountStatusEvent"
  ADD CONSTRAINT "CustomerAccountStatusEvent_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAccountStatusEvent"
  ADD CONSTRAINT "CustomerAccountStatusEvent_actorIdentityId_fkey"
  FOREIGN KEY ("actorIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAccountStatusEvent"
  ADD CONSTRAINT "CustomerAccountStatusEvent_actorMembershipId_fkey"
  FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Customer status history is append-only at the database boundary.
CREATE FUNCTION prevent_customer_account_status_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CustomerAccountStatusEvent rows are append-only';
END;
$$;

CREATE TRIGGER "CustomerAccountStatusEvent_no_update_delete"
BEFORE UPDATE OR DELETE ON "CustomerAccountStatusEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_customer_account_status_event_mutation();