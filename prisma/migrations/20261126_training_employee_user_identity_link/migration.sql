-- Explicit tenant-scoped identity mapping for future employee self-service training.
-- No automatic email/name matching and no existing employee is linked by this migration.
-- Linking must be governed by an administrator workflow before learner access is enabled.
CREATE TABLE "TrainingEmployeeUserLink" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "employeeId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingEmployeeUserLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingEmployeeUserLink_employee_key" UNIQUE ("organizationId", "employeeId"),
  CONSTRAINT "TrainingEmployeeUserLink_user_key" UNIQUE ("organizationId", "userId"),
  CONSTRAINT "TrainingEmployeeUserLink_employee_fkey" FOREIGN KEY ("organizationId", "employeeId")
    REFERENCES "Employee" ("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingEmployeeUserLink_user_fkey" FOREIGN KEY ("organizationId", "userId")
    REFERENCES "User" ("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingEmployeeUserLink_creator_fkey" FOREIGN KEY ("organizationId", "createdByUserId")
    REFERENCES "User" ("organizationId", "id") ON DELETE RESTRICT
);
