-- Controlled User Manual release PDF snapshots
-- Platform-scoped immutable retention metadata; PDF bytes live in private object storage.

CREATE TABLE "UserManualReleaseSnapshot" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "releaseId" UUID NOT NULL REFERENCES "UserManualRelease"("id") ON DELETE RESTRICT,
  "storageKey" TEXT NOT NULL UNIQUE,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "sizeBytes" BIGINT NOT NULL,
  "sha256" TEXT NOT NULL,
  "sectionRevisionIds" UUID[] NOT NULL,
  "generatedByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "generatedByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserManualReleaseSnapshot_pdf_only" CHECK ("mimeType" = 'application/pdf'),
  CONSTRAINT "UserManualReleaseSnapshot_size_positive" CHECK ("sizeBytes" > 0),
  CONSTRAINT "UserManualReleaseSnapshot_sha256_format" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "UserManualReleaseSnapshot_release_created_idx"
  ON "UserManualReleaseSnapshot" ("releaseId", "createdAt" DESC);

CREATE UNIQUE INDEX "UserManualReleaseSnapshot_release_hash_key"
  ON "UserManualReleaseSnapshot" ("releaseId", "sha256");

CREATE OR REPLACE FUNCTION prevent_manual_release_snapshot_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UserManualReleaseSnapshot rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserManualReleaseSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "UserManualReleaseSnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_manual_release_snapshot_mutation();
