CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ManualReleaseStatus" AS ENUM ('DRAFT', 'APPROVED', 'EFFECTIVE', 'ARCHIVED');

CREATE TABLE "HelpCategory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "HelpArticle" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "categoryId" UUID REFERENCES "HelpCategory"("id") ON DELETE SET NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "currentRevisionNumber" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "HelpArticleRevision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "helpArticleId" UUID NOT NULL REFERENCES "HelpArticle"("id") ON DELETE RESTRICT,
  "revisionNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "changeSummary" TEXT NOT NULL,
  "actorIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "actorMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("helpArticleId", "revisionNumber")
);

CREATE TABLE "HelpArticleContextLink" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "helpArticleId" UUID NOT NULL REFERENCES "HelpArticle"("id") ON DELETE RESTRICT,
  "workspaceKey" TEXT NOT NULL,
  "routePattern" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("helpArticleId", "workspaceKey", "routePattern")
);

CREATE TABLE "Manual" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ManualRelease" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manualId" UUID NOT NULL REFERENCES "Manual"("id") ON DELETE RESTRICT,
  "version" TEXT NOT NULL,
  "status" "ManualReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveAt" TIMESTAMP(3),
  "applicableFromProductVersion" TEXT,
  "applicableThroughProductVersion" TEXT,
  "approvalReason" TEXT,
  "approvedByIdentityId" UUID REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "approvedByMembershipId" UUID REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("manualId", "version")
);

CREATE TABLE "ManualSection" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manualReleaseId" UUID NOT NULL REFERENCES "ManualRelease"("id") ON DELETE RESTRICT,
  "sectionKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "currentRevisionNumber" INTEGER NOT NULL DEFAULT 0,
  UNIQUE ("manualReleaseId", "sectionKey")
);

CREATE TABLE "ManualRevision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "manualSectionId" UUID NOT NULL REFERENCES "ManualSection"("id") ON DELETE RESTRICT,
  "revisionNumber" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "changeSummary" TEXT NOT NULL,
  "actorIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "actorMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("manualSectionId", "revisionNumber")
);

CREATE INDEX "HelpArticleRevision_search_idx" ON "HelpArticleRevision" USING GIN (to_tsvector('english', "searchText"));
CREATE INDEX "HelpArticle_status_idx" ON "HelpArticle" ("status");
CREATE INDEX "ManualRelease_status_effective_idx" ON "ManualRelease" ("status", "effectiveAt");

CREATE OR REPLACE FUNCTION prevent_help_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'HelpArticleRevision rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "HelpArticleRevision_append_only"
BEFORE UPDATE OR DELETE ON "HelpArticleRevision"
FOR EACH ROW EXECUTE FUNCTION prevent_help_revision_mutation();

CREATE OR REPLACE FUNCTION prevent_manual_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ManualRevision rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ManualRevision_append_only"
BEFORE UPDATE OR DELETE ON "ManualRevision"
FOR EACH ROW EXECUTE FUNCTION prevent_manual_revision_mutation();

CREATE OR REPLACE FUNCTION protect_effective_manual_release() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('EFFECTIVE', 'ARCHIVED') AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'Effective or archived ManualRelease rows are immutable; create a new release';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ManualRelease_effective_immutable"
BEFORE UPDATE ON "ManualRelease"
FOR EACH ROW EXECUTE FUNCTION protect_effective_manual_release();
