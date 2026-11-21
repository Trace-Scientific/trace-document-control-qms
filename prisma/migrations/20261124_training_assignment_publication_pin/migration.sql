-- Pin new training assignments to an immutable approved course publication.
-- Existing legacy assignments remain nullable and must not be represented as version-pinned.
ALTER TABLE "TrainingAssignment"
  ADD COLUMN "publishedVersionId" uuid;

ALTER TABLE "TrainingAssignment"
  ADD CONSTRAINT "TrainingAssignment_publishedVersion_tenant_fk"
  FOREIGN KEY ("organizationId", "publishedVersionId")
  REFERENCES "TrainingCoursePublishedVersion" ("organizationId", "id")
  ON DELETE RESTRICT;

CREATE INDEX "TrainingAssignment_org_publishedVersion_idx"
  ON "TrainingAssignment" ("organizationId", "publishedVersionId");
