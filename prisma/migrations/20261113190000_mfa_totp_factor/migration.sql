-- Additive TOTP factor storage. Secrets MUST be encrypted before insertion.
-- No factors are enabled and no existing login behavior is changed here.
CREATE TABLE "MfaTotpFactor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "encryptedSecret" TEXT NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "enrolledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMPTZ(3),
  "disabledAt" TIMESTAMPTZ(3),
  "lastUsedStep" BIGINT,
  CONSTRAINT "MfaTotpFactor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MfaTotpFactor_lastUsedStep_check" CHECK ("lastUsedStep" IS NULL OR "lastUsedStep" >= 0)
);
CREATE UNIQUE INDEX "MfaTotpFactor_userId_key" ON "MfaTotpFactor"("userId");
CREATE UNIQUE INDEX "MfaTotpFactor_organizationId_id_key" ON "MfaTotpFactor"("organizationId", "id");
CREATE UNIQUE INDEX "MfaTotpFactor_organizationId_userId_key" ON "MfaTotpFactor"("organizationId", "userId");
CREATE INDEX "MfaTotpFactor_organizationId_verifiedAt_disabledAt_idx" ON "MfaTotpFactor"("organizationId", "verifiedAt", "disabledAt");
ALTER TABLE "MfaTotpFactor" ADD CONSTRAINT "MfaTotpFactor_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaTotpFactor" ADD CONSTRAINT "MfaTotpFactor_organizationId_userId_fkey"
  FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
