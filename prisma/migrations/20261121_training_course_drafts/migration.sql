CREATE TABLE "TrainingCourseDraft" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "courseId" uuid NOT NULL,
  "content" jsonb NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "updatedByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingCourseDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingCourseDraft_organizationId_courseId_key" UNIQUE ("organizationId", "courseId"),
  CONSTRAINT "TrainingCourseDraft_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "TrainingCourseDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TrainingCourseDraft_course_fkey" FOREIGN KEY ("organizationId", "courseId") REFERENCES "TrainingCourse"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TrainingCourseDraft_editor_fkey" FOREIGN KEY ("organizationId", "updatedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TrainingCourseDraft_organizationId_updatedAt_idx" ON "TrainingCourseDraft" ("organizationId", "updatedAt");
