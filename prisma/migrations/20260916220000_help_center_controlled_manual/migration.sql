CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ManualReleaseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "HelpCategory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "HelpArticle" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "categoryId" UUID NOT NULL REFERENCES "HelpCategory"("id") ON DELETE RESTRICT,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedRevisionId" UUID,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "HelpArticleRevision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "articleId" UUID NOT NULL REFERENCES "HelpArticle"("id") ON DELETE RESTRICT,
  "revisionNumber" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "changeSummary" TEXT NOT NULL,
  "createdByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "createdByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("articleId", "revisionNumber")
);

ALTER TABLE "HelpArticle"
  ADD CONSTRAINT "HelpArticle_publishedRevisionId_fkey"
  FOREIGN KEY ("publishedRevisionId") REFERENCES "HelpArticleRevision"("id") ON DELETE RESTRICT;

CREATE TABLE "HelpArticleEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "articleId" UUID NOT NULL REFERENCES "HelpArticle"("id") ON DELETE RESTRICT,
  "revisionId" UUID REFERENCES "HelpArticleRevision"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "actorIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "actorMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "HelpArticleContextLink" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "articleId" UUID NOT NULL REFERENCES "HelpArticle"("id") ON DELETE RESTRICT,
  "contextKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("articleId", "contextKey")
);

CREATE TABLE "UserManual" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserManualSection" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manualId" UUID NOT NULL REFERENCES "UserManual"("id") ON DELETE RESTRICT,
  "sectionCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("manualId", "sectionCode")
);

CREATE TABLE "UserManualSectionRevision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sectionId" UUID NOT NULL REFERENCES "UserManualSection"("id") ON DELETE RESTRICT,
  "revisionNumber" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "changeSummary" TEXT NOT NULL,
  "createdByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "createdByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("sectionId", "revisionNumber")
);

CREATE TABLE "UserManualRelease" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manualId" UUID NOT NULL REFERENCES "UserManual"("id") ON DELETE RESTRICT,
  "version" TEXT NOT NULL,
  "status" "ManualReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "releaseApplicability" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "releaseNotes" TEXT NOT NULL,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("manualId", "version")
);

CREATE TABLE "UserManualReleaseSection" (
  "releaseId" UUID NOT NULL REFERENCES "UserManualRelease"("id") ON DELETE RESTRICT,
  "sectionRevisionId" UUID NOT NULL REFERENCES "UserManualSectionRevision"("id") ON DELETE RESTRICT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("releaseId", "sectionRevisionId"),
  UNIQUE ("releaseId", "displayOrder")
);

CREATE TABLE "UserManualReleaseEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "releaseId" UUID NOT NULL REFERENCES "UserManualRelease"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "actorIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "actorMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "HelpArticle_status_idx" ON "HelpArticle" ("status");
CREATE INDEX "HelpArticle_category_idx" ON "HelpArticle" ("categoryId", "status");
CREATE INDEX "HelpArticleContextLink_context_idx" ON "HelpArticleContextLink" ("contextKey");
CREATE INDEX "UserManualRelease_status_effective_idx" ON "UserManualRelease" ("status", "effectiveAt");

CREATE OR REPLACE FUNCTION prevent_help_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Help history rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "HelpArticleRevision_append_only" BEFORE UPDATE OR DELETE ON "HelpArticleRevision" FOR EACH ROW EXECUTE FUNCTION prevent_help_history_mutation();
CREATE TRIGGER "HelpArticleEvent_append_only" BEFORE UPDATE OR DELETE ON "HelpArticleEvent" FOR EACH ROW EXECUTE FUNCTION prevent_help_history_mutation();

CREATE OR REPLACE FUNCTION prevent_manual_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'User manual history rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UserManualSectionRevision_append_only" BEFORE UPDATE OR DELETE ON "UserManualSectionRevision" FOR EACH ROW EXECUTE FUNCTION prevent_manual_history_mutation();
CREATE TRIGGER "UserManualReleaseEvent_append_only" BEFORE UPDATE OR DELETE ON "UserManualReleaseEvent" FOR EACH ROW EXECUTE FUNCTION prevent_manual_history_mutation();

CREATE OR REPLACE FUNCTION protect_published_manual_release() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'ARCHIVED' THEN
    RAISE EXCEPTION 'Archived user manual releases are immutable';
  END IF;
  IF OLD."status" = 'PUBLISHED' AND (
    NEW."manualId" IS DISTINCT FROM OLD."manualId" OR
    NEW."version" IS DISTINCT FROM OLD."version" OR
    NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt" OR
    NEW."releaseApplicability" IS DISTINCT FROM OLD."releaseApplicability" OR
    NEW."releaseNotes" IS DISTINCT FROM OLD."releaseNotes" OR
    NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
  ) THEN
    RAISE EXCEPTION 'Published user manual release content is immutable; create a new release';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UserManualRelease_published_immutable" BEFORE UPDATE ON "UserManualRelease" FOR EACH ROW EXECUTE FUNCTION protect_published_manual_release();

CREATE OR REPLACE FUNCTION protect_published_release_sections() RETURNS trigger AS $$
DECLARE release_status "ManualReleaseStatus";
BEGIN
  SELECT "status" INTO release_status FROM "UserManualRelease" WHERE "id" = COALESCE(NEW."releaseId", OLD."releaseId");
  IF release_status <> 'DRAFT' THEN RAISE EXCEPTION 'Only draft user manual releases can change sections'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "UserManualReleaseSection_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "UserManualReleaseSection" FOR EACH ROW EXECUTE FUNCTION protect_published_release_sections();
