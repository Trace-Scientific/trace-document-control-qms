-- Pin new training assignments to an immutable approved course publication.
-- Existing legacy assignments remain nullable and must not be represented as version-pinned.
ALTER TABLE "TrainingAssignment"
  ADD COLUMN "publishedVersionId" uuid;

-- PostgreSQL requires a unique referenced key for the tenant-scoped foreign key.
ALTER TABLE "TrainingCoursePublishedVersion"
  ADD CONSTRAINT "TrainingCoursePublishedVersion_org_id_key" UNIQUE ("organizationId", "id");

ALTER TABLE "TrainingAssignment"
  ADD CONSTRAINT "TrainingAssignment_publishedVersion_tenant_fk"
  FOREIGN KEY ("organizationId", "publishedVersionId")
  REFERENCES "TrainingCoursePublishedVersion" ("organizationId", "id")
  ON DELETE RESTRICT;

CREATE INDEX "TrainingAssignment_org_publishedVersion_idx"
  ON "TrainingAssignment" ("organizationId", "publishedVersionId");
