-- Controlled Support Access
-- Additive control-plane schema. Ordinary tenant authorization remains unchanged.

CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "SupportAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');
CREATE TYPE "SupportAccessDecision" AS ENUM ('APPROVED', 'DENIED');
CREATE TYPE "SupportSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'REVOKED', 'EXPIRED');
CREATE TYPE "SupportSessionEventType" AS ENUM ('ISSUED', 'ASSUMED', 'EXITED', 'REVOKED', 'EXPIRED');

CREATE TABLE "SupportCase" (
  "id" UUID NOT NULL,
  "customerAccountId" UUID NOT NULL,
  "targetOrganizationId" UUID NOT NULL,
  "caseNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
  "openedByMembershipId" UUID NOT NULL,
  "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedByMembershipId" UUID,
  "closedAt" TIMESTAMPTZ(3),
  "closeReason" TEXT,
  CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportCase_caseNumber_key" ON "SupportCase"("caseNumber");
CREATE INDEX "SupportCase_customerAccountId_status_idx" ON "SupportCase"("customerAccountId", "status");
CREATE INDEX "SupportCase_targetOrganizationId_status_idx" ON "SupportCase"("targetOrganizationId", "status");

ALTER TABLE "SupportCase"
  ADD CONSTRAINT "SupportCase_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase"
  ADD CONSTRAINT "SupportCase_targetOrganizationId_fkey"
  FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase"
  ADD CONSTRAINT "SupportCase_openedByMembershipId_fkey"
  FOREIGN KEY ("openedByMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase"
  ADD CONSTRAINT "SupportCase_closedByMembershipId_fkey"
  FOREIGN KEY ("closedByMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase"
  ADD CONSTRAINT "SupportCase_close_fields_check"
  CHECK (("status" = 'OPEN' AND "closedAt" IS NULL AND "closedByMembershipId" IS NULL)
      OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "closedByMembershipId" IS NOT NULL));

CREATE TABLE "SupportCapability" (
  "key" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "supportSafeWrite" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "SupportCapability_pkey" PRIMARY KEY ("key")
);

INSERT INTO "SupportCapability" ("key", "description", "supportSafeWrite") VALUES
  ('support.tenant.read', 'Read support-safe tenant data through support-aware routes.', false),
  ('support.tenant.troubleshoot', 'Use support-safe diagnostic operations that do not alter governed records.', false),
  ('support.tenant.safe_write', 'Perform explicitly support-safe tenant mutations with correlated dual audit.', true)
ON CONFLICT ("key") DO NOTHING;

CREATE TABLE "SupportAccessRequest" (
  "id" UUID NOT NULL,
  "caseId" UUID NOT NULL,
  "targetOrganizationId" UUID NOT NULL,
  "requestedByMembershipId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "SupportAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "cancelledAt" TIMESTAMPTZ(3),
  CONSTRAINT "SupportAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAccessRequest_caseId_status_idx" ON "SupportAccessRequest"("caseId", "status");
CREATE INDEX "SupportAccessRequest_requestedByMembershipId_status_idx" ON "SupportAccessRequest"("requestedByMembershipId", "status");
ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_targetOrganizationId_fkey"
  FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_requestedByMembershipId_fkey"
  FOREIGN KEY ("requestedByMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_expiry_check" CHECK ("requestedExpiresAt" > "requestedAt");

CREATE TABLE "SupportAccessRequestCapability" (
  "requestId" UUID NOT NULL,
  "capabilityKey" TEXT NOT NULL,
  CONSTRAINT "SupportAccessRequestCapability_pkey" PRIMARY KEY ("requestId", "capabilityKey")
);
ALTER TABLE "SupportAccessRequestCapability"
  ADD CONSTRAINT "SupportAccessRequestCapability_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupportAccessRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAccessRequestCapability"
  ADD CONSTRAINT "SupportAccessRequestCapability_capabilityKey_fkey"
  FOREIGN KEY ("capabilityKey") REFERENCES "SupportCapability"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SupportAccessApproval" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "decidedByMembershipId" UUID NOT NULL,
  "decision" "SupportAccessDecision" NOT NULL,
  "decisionReason" TEXT NOT NULL,
  "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAccessApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportAccessApproval_requestId_key" ON "SupportAccessApproval"("requestId");
ALTER TABLE "SupportAccessApproval"
  ADD CONSTRAINT "SupportAccessApproval_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupportAccessRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessApproval"
  ADD CONSTRAINT "SupportAccessApproval_decidedByMembershipId_fkey"
  FOREIGN KEY ("decidedByMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SupportSession" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "caseId" UUID NOT NULL,
  "actorIdentityId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "targetOrganizationId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "SupportSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "endedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "revokedByMembershipId" UUID,
  "revocationReason" TEXT,
  CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportSession_requestId_key" ON "SupportSession"("requestId");
CREATE UNIQUE INDEX "SupportSession_tokenHash_key" ON "SupportSession"("tokenHash");
CREATE INDEX "SupportSession_actorMembershipId_status_idx" ON "SupportSession"("actorMembershipId", "status");
CREATE INDEX "SupportSession_targetOrganizationId_status_idx" ON "SupportSession"("targetOrganizationId", "status");
CREATE INDEX "SupportSession_expiresAt_idx" ON "SupportSession"("expiresAt");
ALTER TABLE "SupportSession"
  ADD CONSTRAINT "SupportSession_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupportAccessRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession"
  ADD CONSTRAINT "SupportSession_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession"
  ADD CONSTRAINT "SupportSession_actorIdentityId_fkey"
  FOREIGN KEY ("actorIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession"
  ADD CONSTRAINT "SupportSession_actorMembershipId_fkey"
  FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession"
  ADD CONSTRAINT "SupportSession_targetOrganizationId_fkey"
  FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession"
  ADD CONSTRAINT "SupportSession_revokedByMembershipId_fkey"
  FOREIGN KEY ("revokedByMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession"
  ADD CONSTRAINT "SupportSession_expiry_check" CHECK ("expiresAt" > "issuedAt");

CREATE TABLE "SupportSessionCapability" (
  "sessionId" UUID NOT NULL,
  "capabilityKey" TEXT NOT NULL,
  CONSTRAINT "SupportSessionCapability_pkey" PRIMARY KEY ("sessionId", "capabilityKey")
);
ALTER TABLE "SupportSessionCapability"
  ADD CONSTRAINT "SupportSessionCapability_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "SupportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportSessionCapability"
  ADD CONSTRAINT "SupportSessionCapability_capabilityKey_fkey"
  FOREIGN KEY ("capabilityKey") REFERENCES "SupportCapability"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SupportSessionEvent" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "eventType" "SupportSessionEventType" NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "SupportSessionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportSessionEvent_sessionId_occurredAt_idx" ON "SupportSessionEvent"("sessionId", "occurredAt");
ALTER TABLE "SupportSessionEvent"
  ADD CONSTRAINT "SupportSessionEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "SupportSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSessionEvent"
  ADD CONSTRAINT "SupportSessionEvent_actorMembershipId_fkey"
  FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_support_session_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SupportSessionEvent rows are append-only';
END;
$$;
CREATE TRIGGER "SupportSessionEvent_no_update_delete"
BEFORE UPDATE OR DELETE ON "SupportSessionEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_support_session_event_mutation();

CREATE FUNCTION prevent_support_access_approval_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SupportAccessApproval rows are append-only';
END;
$$;
CREATE TRIGGER "SupportAccessApproval_no_update_delete"
BEFORE UPDATE OR DELETE ON "SupportAccessApproval"
FOR EACH ROW EXECUTE FUNCTION prevent_support_access_approval_mutation();
