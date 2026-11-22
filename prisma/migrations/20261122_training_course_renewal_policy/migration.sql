-- Tenant-scoped course renewal policy; no automatic reassignment or modification of completions.
CREATE TABLE "TrainingCourseRenewalPolicy" (
  "organizationId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "intervalMonths" INTEGER NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingCourseRenewalPolicy_pkey" PRIMARY KEY ("organizationId", "courseId"),
  CONSTRAINT "TrainingCourseRenewalPolicy_interval_check" CHECK ("intervalMonths" BETWEEN 1 AND 120),
  CONSTRAINT "TrainingCourseRenewalPolicy_course_fkey" FOREIGN KEY ("organizationId", "courseId")
    REFERENCES "TrainingCourse"("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingCourseRenewalPolicy_user_fkey" FOREIGN KEY ("organizationId", "updatedByUserId")
    REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT
);
