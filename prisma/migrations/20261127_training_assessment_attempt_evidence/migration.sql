-- Immutable assessment-attempt evidence; no attempt records are created by this migration.
CREATE TABLE "TrainingAssessmentAttempt" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "assignmentId" uuid NOT NULL,
  "employeeId" uuid NOT NULL,
  "courseId" uuid NOT NULL,
  "publishedVersionId" uuid NOT NULL,
  "submittedByUserId" uuid NOT NULL,
  "answers" jsonb NOT NULL,
  "questionCount" integer NOT NULL,
  "correctCount" integer NOT NULL,
  "scorePercent" numeric(5,2) NOT NULL,
  "passingScorePercent" numeric(5,2) NOT NULL,
  "passed" boolean NOT NULL,
  "submittedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingAssessmentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingAssessmentAttempt_question_count_check" CHECK ("questionCount" > 0),
  CONSTRAINT "TrainingAssessmentAttempt_correct_count_check" CHECK ("correctCount" >= 0 AND "correctCount" <= "questionCount"),
  CONSTRAINT "TrainingAssessmentAttempt_score_check" CHECK ("scorePercent" >= 0 AND "scorePercent" <= 100),
  CONSTRAINT "TrainingAssessmentAttempt_passing_check" CHECK ("passingScorePercent" >= 0 AND "passingScorePercent" <= 100),
  CONSTRAINT "TrainingAssessmentAttempt_assignment_fkey" FOREIGN KEY ("organizationId", "assignmentId")
    REFERENCES "TrainingAssignment" ("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingAssessmentAttempt_employee_fkey" FOREIGN KEY ("organizationId", "employeeId")
    REFERENCES "Employee" ("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingAssessmentAttempt_publication_fkey" FOREIGN KEY ("organizationId", "courseId", "publishedVersionId")
    REFERENCES "TrainingCoursePublishedVersion" ("organizationId", "courseId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingAssessmentAttempt_submitter_fkey" FOREIGN KEY ("organizationId", "submittedByUserId")
    REFERENCES "User" ("organizationId", "id") ON DELETE RESTRICT
);
CREATE INDEX "TrainingAssessmentAttempt_assignment_submitted_idx"
  ON "TrainingAssessmentAttempt" ("organizationId", "assignmentId", "submittedAt" DESC);
