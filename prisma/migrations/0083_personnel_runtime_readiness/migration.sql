-- Personnel runtime readiness repair.
--
-- This migration is intentionally idempotent. It restores the governed Personnel
-- foundation when an environment has migration-history/schema drift, while remaining
-- a no-op where 0022_personnel_management_foundation is already fully applied.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeStatus') THEN
    CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Employee" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "userId" uuid,
  "employeeNumber" text NOT NULL,
  "firstName" text NOT NULL,
  "lastName" text NOT NULL,
  "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "hireDate" date,
  "terminationDate" date,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "organizationId" uuid;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "userId" uuid;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeNumber" text;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "firstName" text;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "lastName" text;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" "EmployeeStatus" DEFAULT 'ACTIVE';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "hireDate" date;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "terminationDate" date;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_pkey') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_organizationId_fkey') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_organizationId_id_key') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_id_key" UNIQUE ("organizationId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_organizationId_employeeNumber_key') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_employeeNumber_key" UNIQUE ("organizationId", "employeeNumber");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_organizationId_userId_key') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_userId_key" UNIQUE ("organizationId", "userId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_user_fkey') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_user_fkey"
      FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_termination_after_hire_check') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_termination_after_hire_check"
      CHECK ("terminationDate" IS NULL OR "hireDate" IS NULL OR "terminationDate" >= "hireDate");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "JobDescription" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "organizationId" uuid;
ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "code" text;
ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "JobDescription" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobDescription_pkey') THEN
    ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobDescription_organizationId_fkey') THEN
    ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobDescription_organizationId_id_key') THEN
    ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_organizationId_id_key" UNIQUE ("organizationId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobDescription_organizationId_code_key') THEN
    ALTER TABLE "JobDescription" ADD CONSTRAINT "JobDescription_organizationId_code_key" UNIQUE ("organizationId", "code");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmployeeJobAssignment" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "employeeId" uuid NOT NULL,
  "jobDescriptionId" uuid NOT NULL,
  "siteId" uuid,
  "departmentId" uuid,
  "isPrimary" boolean NOT NULL DEFAULT false,
  "assignedAt" date NOT NULL,
  "endedAt" date,
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "organizationId" uuid;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "employeeId" uuid;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "jobDescriptionId" uuid;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "siteId" uuid;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "departmentId" uuid;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "isPrimary" boolean DEFAULT false;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "assignedAt" date;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "endedAt" date;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "createdByUserId" uuid;
ALTER TABLE "EmployeeJobAssignment" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_pkey') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_organizationId_fkey') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_organizationId_id_key') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_organizationId_id_key" UNIQUE ("organizationId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_employee_fkey') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_employee_fkey"
      FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_job_fkey') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_job_fkey"
      FOREIGN KEY ("organizationId", "jobDescriptionId") REFERENCES "JobDescription"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_site_fkey') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_site_fkey"
      FOREIGN KEY ("organizationId", "siteId") REFERENCES "Site"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_department_fkey') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_department_fkey"
      FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_creator_fkey') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_creator_fkey"
      FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeJobAssignment_dates_check') THEN
    ALTER TABLE "EmployeeJobAssignment" ADD CONSTRAINT "EmployeeJobAssignment_dates_check"
      CHECK ("endedAt" IS NULL OR "assignedAt" IS NULL OR "endedAt" >= "assignedAt");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Employee_organizationId_status_idx"
  ON "Employee"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "EmployeeJobAssignment_organizationId_employeeId_assignedAt_idx"
  ON "EmployeeJobAssignment"("organizationId", "employeeId", "assignedAt");
CREATE INDEX IF NOT EXISTS "EmployeeJobAssignment_organizationId_jobDescriptionId_idx"
  ON "EmployeeJobAssignment"("organizationId", "jobDescriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeJobAssignment_one_active_primary_per_employee_idx"
  ON "EmployeeJobAssignment"("organizationId", "employeeId")
  WHERE "isPrimary" = true AND "endedAt" IS NULL;

INSERT INTO "Permission" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'personnel.read', 'View governed personnel records'),
  (gen_random_uuid(), 'personnel.manage', 'Create and manage governed personnel records and job assignments')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."systemRole" = true
  AND r."name" = 'System Administrator'
  AND p."key" IN ('personnel.read', 'personnel.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
