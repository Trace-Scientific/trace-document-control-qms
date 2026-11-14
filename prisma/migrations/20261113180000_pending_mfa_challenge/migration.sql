-- Additive MFA challenge persistence only; no existing sessions or users modified.
CREATE TABLE "PendingMfaChallenge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PendingMfaChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PendingMfaChallenge_attempts_check" CHECK ("failedAttempts" >= 0)
);

CREATE UNIQUE INDEX "PendingMfaChallenge_tokenHash_key" ON "PendingMfaChallenge"("tokenHash");
CREATE UNIQUE INDEX "PendingMfaChallenge_organizationId_id_key" ON "PendingMfaChallenge"("organizationId", "id");
CREATE INDEX "PendingMfaChallenge_organizationId_userId_expiresAt_idx" ON "PendingMfaChallenge"("organizationId", "userId", "expiresAt");
CREATE INDEX "PendingMfaChallenge_expiresAt_idx" ON "PendingMfaChallenge"("expiresAt");

ALTER TABLE "PendingMfaChallenge" ADD CONSTRAINT "PendingMfaChallenge_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PendingMfaChallenge" ADD CONSTRAINT "PendingMfaChallenge_organizationId_userId_fkey"
  FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
