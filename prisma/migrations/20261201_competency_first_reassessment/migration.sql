ALTER TABLE "CompetencyProgram"
  ADD COLUMN "firstReassessmentDays" integer CHECK ("firstReassessmentDays" BETWEEN 1 AND 3650);
