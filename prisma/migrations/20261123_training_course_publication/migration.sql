ALTER TABLE "TrainingCourseReview" DROP CONSTRAINT "TrainingCourseReview_status_check";
ALTER TABLE "TrainingCourseReview" ADD CONSTRAINT "TrainingCourseReview_status_check" CHECK ("status" IN ('PENDING', 'SUPERSEDED', 'APPROVED', 'REJECTED'));
ALTER TABLE "TrainingCourseReview" ADD COLUMN "decidedByUserId" uuid;
ALTER TABLE "TrainingCourseReview" ADD COLUMN "decidedAt" timestamptz(3);
ALTER TABLE "TrainingCourseReview" ADD COLUMN "decisionReason" text;
ALTER TABLE "TrainingCourseReview" ADD CONSTRAINT "TrainingCourseReview_decider_fkey"
  FOREIGN KEY ("organizationId", "decidedByUserId") REFERENCES "User" ("organizationId", "id") ON DELETE RESTRICT;
ALTER TABLE "TrainingCourseReview" ADD CONSTRAINT "TrainingCourseReview_decision_check"
  CHECK (( "status" IN ('APPROVED', 'REJECTED') AND "decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL )
      OR ( "status" IN ('PENDING', 'SUPERSEDED') AND "decidedByUserId" IS NULL AND "decidedAt" IS NULL ));
ALTER TABLE "TrainingCourseReview" ADD CONSTRAINT "TrainingCourseReview_separation_check"
  CHECK ("decidedByUserId" IS NULL OR "decidedByUserId" <> "submittedByUserId");
CREATE TABLE "TrainingCoursePublishedVersion" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "courseId" uuid NOT NULL,
  "version" integer NOT NULL,
  "reviewId" uuid NOT NULL,
  "content" jsonb NOT NULL,
  "publishedByUserId" uuid NOT NULL,
  "publishedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingCoursePublishedVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingCoursePublishedVersion_org_course_version_key" UNIQUE ("organizationId", "courseId", "version"),
  CONSTRAINT "TrainingCoursePublishedVersion_org_review_key" UNIQUE ("organizationId", "reviewId"),
  CONSTRAINT "TrainingCoursePublishedVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "TrainingCoursePublishedVersion_course_fkey" FOREIGN KEY ("organizationId", "courseId") REFERENCES "TrainingCourse" ("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingCoursePublishedVersion_review_fkey" FOREIGN KEY ("organizationId", "reviewId") REFERENCES "TrainingCourseReview" ("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingCoursePublishedVersion_publisher_fkey" FOREIGN KEY ("organizationId", "publishedByUserId") REFERENCES "User" ("organizationId", "id") ON DELETE RESTRICT
);
ALTER TABLE "TrainingCourseReview" ADD CONSTRAINT "TrainingCourseReview_org_id_key" UNIQUE ("organizationId", "id");
