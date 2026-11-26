ALTER TABLE "CompetencyProgram"
  ADD COLUMN "initialDueDays" integer CHECK ("initialDueDays" BETWEEN 0 AND 3650),
  ADD COLUMN "reassessmentIntervalDays" integer CHECK ("reassessmentIntervalDays" BETWEEN 1 AND 3650);
