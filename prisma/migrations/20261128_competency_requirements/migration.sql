CREATE TABLE "CompetencyRequirement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "programId" uuid NOT NULL,
  "employeeId" uuid,
  "departmentId" uuid,
  "jobDescriptionId" uuid,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" timestamptz(3),
  CONSTRAINT "CompetencyRequirement_one_target_check"
    CHECK (num_nonnulls("employeeId", "departmentId", "jobDescriptionId") = 1),
  CONSTRAINT "CompetencyRequirement_program_fkey" FOREIGN KEY ("organizationId", "programId")
    REFERENCES "CompetencyProgram"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompetencyRequirement_employee_fkey" FOREIGN KEY ("organizationId", "employeeId")
    REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompetencyRequirement_department_fkey" FOREIGN KEY ("organizationId", "departmentId")
    REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompetencyRequirement_job_fkey" FOREIGN KEY ("organizationId", "jobDescriptionId")
    REFERENCES "JobDescription"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetencyRequirement_active_target_idx"
  ON "CompetencyRequirement"("organizationId", "programId", "employeeId", "departmentId", "jobDescriptionId")
  NULLS NOT DISTINCT WHERE "retiredAt" IS NULL;
