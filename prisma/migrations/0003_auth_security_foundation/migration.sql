CREATE TYPE "AuthenticationEventType" AS ENUM ('LOGIN', 'LOGIN_FAILURE', 'REAUTHENTICATION', 'MFA_CHALLENGE', 'LOGOUT', 'SESSION_REVOKED');
CREATE TYPE "AuthenticationOutcome" AS ENUM ('SUCCESS', 'FAILURE');
CREATE TYPE "AuthenticationMethod" AS ENUM ('PASSWORD', 'MFA', 'SSO', 'RECOVERY');

CREATE TABLE "Credential" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'scrypt',
  "version" INTEGER NOT NULL DEFAULT 1,
  "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMPTZ(3),
  CONSTRAINT "Credential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Credential_password_hash_check" CHECK ("passwordHash" LIKE 'scrypt$%'),
  CONSTRAINT "Credential_version_check" CHECK ("version" > 0)
);

CREATE TABLE "AuthenticationEvent" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID,
  "eventType" "AuthenticationEventType" NOT NULL,
  "outcome" "AuthenticationOutcome" NOT NULL,
  "method" "AuthenticationMethod" NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMPTZ(3),
  "correlationId" UUID,
  "ipAddressHash" TEXT,
  "userAgentHash" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "AuthenticationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthenticationEvent_validity_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "occurredAt")
);

CREATE TABLE "Session" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "authenticationEventId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "revokedByUserId" UUID,
  "revocationReason" TEXT,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_token_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "Session_expiration_check" CHECK ("idleExpiresAt" <= "absoluteExpiresAt" AND "absoluteExpiresAt" > "createdAt"),
  CONSTRAINT "Session_revocation_check" CHECK (
    ("revokedAt" IS NULL AND "revokedByUserId" IS NULL AND "revocationReason" IS NULL)
    OR ("revokedAt" IS NOT NULL AND "revocationReason" IS NOT NULL AND length(btrim("revocationReason")) > 0)
  )
);

CREATE UNIQUE INDEX "Credential_userId_key" ON "Credential"("userId");
CREATE UNIQUE INDEX "Credential_organizationId_id_key" ON "Credential"("organizationId", "id");
CREATE UNIQUE INDEX "Credential_organizationId_userId_key" ON "Credential"("organizationId", "userId");
CREATE INDEX "AuthenticationEvent_organizationId_userId_occurredAt_idx" ON "AuthenticationEvent"("organizationId", "userId", "occurredAt");
CREATE INDEX "AuthenticationEvent_organizationId_correlationId_idx" ON "AuthenticationEvent"("organizationId", "correlationId");
CREATE UNIQUE INDEX "AuthenticationEvent_organizationId_id_key" ON "AuthenticationEvent"("organizationId", "id");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_organizationId_userId_revokedAt_idx" ON "Session"("organizationId", "userId", "revokedAt");
CREATE INDEX "Session_idleExpiresAt_idx" ON "Session"("idleExpiresAt");
CREATE INDEX "Session_absoluteExpiresAt_idx" ON "Session"("absoluteExpiresAt");
CREATE UNIQUE INDEX "Session_organizationId_id_key" ON "Session"("organizationId", "id");

ALTER TABLE "ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_organizationId_authenticationEventId_fkey" FOREIGN KEY ("organizationId", "authenticationEventId") REFERENCES "AuthenticationEvent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthenticationEvent" ADD CONSTRAINT "AuthenticationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthenticationEvent" ADD CONSTRAINT "AuthenticationEvent_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_authenticationEventId_fkey" FOREIGN KEY ("organizationId", "authenticationEventId") REFERENCES "AuthenticationEvent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_revokedByUserId_fkey" FOREIGN KEY ("organizationId", "revokedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_authentication_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuthenticationEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuthenticationEvent_append_only_update"
BEFORE UPDATE ON "AuthenticationEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_authentication_event_mutation();

CREATE TRIGGER "AuthenticationEvent_append_only_delete"
BEFORE DELETE ON "AuthenticationEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_authentication_event_mutation();
