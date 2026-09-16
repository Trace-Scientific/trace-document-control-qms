-- PR 7: Help Center & Controlled User Manual

CREATE TYPE "HelpContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ManualReleaseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "HelpCategory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "HelpArticle" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "categoryId" UUID NOT NULL REFERENCES "HelpCategory"("id") ON DELETE RESTRICT,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "status" "HelpContentStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedRevisionId" UUID,
  "publishedAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockVersion" INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE "HelpArticleRevision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "articleId" UUID NOT NULL REFERENCES "HelpArticle"("id") ON DELETE RESTRICT,
  "revisionNumber" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "changeSummary" TEXT NOT NULL,
  "createdByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "createdByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserManual" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserManualSection" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manualId" UUID NOT NULL REFERENCES "UserManual"("id") ON DELETE RESTRICT,
  "sectionCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("sectionId", "revisionNumber")
);

CREATE TABLE "UserManualRelease" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manualId" UUID NOT NULL REFERENCES "UserManual"("id") ON DELETE RESTRICT,
  "version" TEXT NOT NULL,
  "status" "ManualReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveAt" TIMESTAMPTZ NOT NULL,
  "releaseApplicability" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "releaseNotes" TEXT NOT NULL,
  "publishedAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockVersion" INTEGER NOT NULL DEFAULT 1,
  UNIQUE ("manualId", "version")
);

CREATE TABLE "UserManualReleaseSection" (
  "releaseId" UUID NOT NULL REFERENCES "UserManualRelease"("id") ON DELETE RESTRICT,
  "sectionRevisionId" UUID NOT NULL REFERENCES "UserManualSectionRevision"("id") ON DELETE RESTRICT,
  "displayOrder" INTEGER NOT NULL,
  PRIMARY KEY ("releaseId", "sectionRevisionId")
);

CREATE TABLE "UserManualReleaseEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "releaseId" UUID NOT NULL REFERENCES "UserManualRelease"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "actorIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "actorMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "HelpArticle_category_status_idx" ON "HelpArticle" ("categoryId", "status");
CREATE INDEX "HelpArticle_title_idx" ON "HelpArticle" ("title");
CREATE INDEX "HelpArticleRevision_article_idx" ON "HelpArticleRevision" ("articleId", "revisionNumber" DESC);
CREATE INDEX "UserManualRelease_manual_status_idx" ON "UserManualRelease" ("manualId", "status", "effectiveAt" DESC);
CREATE INDEX "UserManualSection_manual_order_idx" ON "UserManualSection" ("manualId", "displayOrder");

CREATE OR REPLACE FUNCTION prevent_help_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'HelpArticleRevision rows are append-only; create a new revision';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "HelpArticleRevision_immutable"
BEFORE UPDATE OR DELETE ON "HelpArticleRevision"
FOR EACH ROW EXECUTE FUNCTION prevent_help_revision_mutation();

CREATE OR REPLACE FUNCTION prevent_help_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'HelpArticleEvent rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "HelpArticleEvent_immutable"
BEFORE UPDATE OR DELETE ON "HelpArticleEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_help_event_mutation();

CREATE OR REPLACE FUNCTION prevent_manual_section_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UserManualSectionRevision rows are append-only; create a new revision';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserManualSectionRevision_immutable"
BEFORE UPDATE OR DELETE ON "UserManualSectionRevision"
FOR EACH ROW EXECUTE FUNCTION prevent_manual_section_revision_mutation();

CREATE OR REPLACE FUNCTION protect_published_manual_release() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('PUBLISHED', 'ARCHIVED') THEN
    IF NEW."manualId" IS DISTINCT FROM OLD."manualId"
       OR NEW."version" IS DISTINCT FROM OLD."version"
       OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt"
       OR NEW."releaseApplicability" IS DISTINCT FROM OLD."releaseApplicability"
       OR NEW."releaseNotes" IS DISTINCT FROM OLD."releaseNotes"
       OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" THEN
      RAISE EXCEPTION 'Published UserManualRelease configuration is immutable; create a new release';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserManualRelease_protect_published"
BEFORE UPDATE ON "UserManualRelease"
FOR EACH ROW EXECUTE FUNCTION protect_published_manual_release();

CREATE OR REPLACE FUNCTION protect_manual_release_sections() RETURNS trigger AS $$
DECLARE
  release_status "ManualReleaseStatus";
  target_release_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_release_id := OLD."releaseId";
  ELSE
    target_release_id := NEW."releaseId";
  END IF;

  SELECT "status" INTO release_status FROM "UserManualRelease" WHERE "id" = target_release_id;
  IF release_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Sections for a published or archived UserManualRelease are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserManualReleaseSection_draft_only"
BEFORE INSERT OR UPDATE OR DELETE ON "UserManualReleaseSection"
FOR EACH ROW EXECUTE FUNCTION protect_manual_release_sections();

CREATE OR REPLACE FUNCTION prevent_manual_release_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UserManualReleaseEvent rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserManualReleaseEvent_immutable"
BEFORE UPDATE OR DELETE ON "UserManualReleaseEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_manual_release_event_mutation();