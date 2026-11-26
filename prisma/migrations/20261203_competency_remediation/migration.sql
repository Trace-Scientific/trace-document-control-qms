CREATE TABLE "CompetencyRemediation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "assessmentId" uuid NOT NULL,
  "plan" text NOT NULL CHECK (length(btrim("plan")) BETWEEN 1 AND 2000),
  "dueOn" date,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" timestamptz(3),
  "followUpAssessmentId" uuid,
  "resolution" text CHECK (length(btrim("resolution")) BETWEEN 1 AND 2000),
  UNIQUE ("organizationId", "assessmentId"),
  FOREIGN KEY ("organizationId", "assessmentId")
    REFERENCES "CompetencyAssessment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("organizationId", "followUpAssessmentId")
    REFERENCES "CompetencyAssessment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("followUpAssessmentId" IS NULL OR "followUpAssessmentId" <> "assessmentId"),
  CHECK (num_nonnulls("closedAt", "followUpAssessmentId", "resolution") IN (0, 3))
);
