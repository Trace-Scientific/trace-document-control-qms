CREATE TABLE "TrainingCourseReview" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "courseId" uuid NOT NULL,
  "draftRevision" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "submittedByUserId" uuid NOT NULL,
  "submittedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingCourseReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingCourseReview_org_course_revision_key" UNIQUE ("organizationId", "courseId", "draftRevision"),
  CONSTRAINT "TrainingCourseReview_status_check" CHECK ("status" IN ('PENDING', 'SUPERSEDED')),
  CONSTRAINT "TrainingCourseReview_revision_check" CHECK ("draftRevision" > 0),
  CONSTRAINT "TrainingCourseReview_course_fkey" FOREIGN KEY ("organizationId", "courseId") REFERENCES "TrainingCourse" ("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingCourseReview_submitter_fkey" FOREIGN KEY ("organizationId", "submittedByUserId") REFERENCES "User" ("organizationId", "id") ON DELETE RESTRICT
);
CREATE INDEX "TrainingCourseReview_organizationId_status_idx" ON "TrainingCourseReview" ("organizationId", "status", "submittedAt");
