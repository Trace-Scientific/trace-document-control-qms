-- PR 18: provider-neutral OAuth credential lifecycle metadata.
-- Access tokens, refresh tokens, client secrets, authorization codes, OAuth state values,
-- and PKCE verifiers are never stored here.

CREATE TYPE "PlatformOAuthLifecycleStatus" AS ENUM ('ACTIVE','REFRESHING','REVOKING','REAUTH_REQUIRED','REVOKED','ERROR');

CREATE TABLE "PlatformOAuthCredentialLifecycle" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" UUID NOT NULL UNIQUE REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "providerKey" TEXT NOT NULL,
  "status" "PlatformOAuthLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "nextRefreshAt" TIMESTAMPTZ,
  "lastRefreshAt" TIMESTAMPTZ,
  "lastRevokedAt" TIMESTAMPTZ,
  "lastFailureAt" TIMESTAMPTZ,
  "lastFailureCode" TEXT,
  "claimedAt" TIMESTAMPTZ,
  "claimedBy" TEXT,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformOAuthCredentialLifecycle_claim_check" CHECK (
    (("status" IN ('REFRESHING','REVOKING')) = ("claimedAt" IS NOT NULL AND "claimedBy" IS NOT NULL))
  ),
  CONSTRAINT "PlatformOAuthCredentialLifecycle_failure_code_check" CHECK (
    "lastFailureCode" IS NULL OR char_length("lastFailureCode") <= 160
  )
);

CREATE INDEX "PlatformOAuthCredentialLifecycle_refresh_idx"
  ON "PlatformOAuthCredentialLifecycle"("status","nextRefreshAt");
CREATE INDEX "PlatformOAuthCredentialLifecycle_provider_idx"
  ON "PlatformOAuthCredentialLifecycle"("providerKey","status");

CREATE TABLE "PlatformOAuthAuthorizationSession" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "providerKey" TEXT NOT NULL,
  "stateSha256" TEXT NOT NULL UNIQUE,
  "pkceChallenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "consumedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformOAuthAuthorizationSession_state_hash_check" CHECK (char_length("stateSha256") = 64),
  CONSTRAINT "PlatformOAuthAuthorizationSession_pkce_check" CHECK (char_length("pkceChallenge") BETWEEN 43 AND 128),
  CONSTRAINT "PlatformOAuthAuthorizationSession_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE INDEX "PlatformOAuthAuthorizationSession_connection_idx"
  ON "PlatformOAuthAuthorizationSession"("connectionId","expiresAt");
