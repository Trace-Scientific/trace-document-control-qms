-- A pinned publication must belong to the assignment's course as well as its tenant.
-- Existing unpinned legacy assignments remain valid (nullable publishedVersionId).
-- Existing pinned assignments created by the governed assignment workflow already
-- use the matching course; migration fails safely if any inconsistent data exists.
ALTER TABLE "TrainingCoursePublishedVersion"
  ADD CONSTRAINT "TrainingCoursePublishedVersion_org_course_id_key"
  UNIQUE ("organizationId", "courseId", "id");

ALTER TABLE "TrainingAssignment"
  DROP CONSTRAINT "TrainingAssignment_publishedVersion_fkey";

ALTER TABLE "TrainingAssignment"
  ADD CONSTRAINT "TrainingAssignment_publishedVersion_course_fkey"
  FOREIGN KEY ("organizationId", "courseId", "publishedVersionId")
  REFERENCES "TrainingCoursePublishedVersion" ("organizationId", "courseId", "id")
  ON DELETE RESTRICT;
