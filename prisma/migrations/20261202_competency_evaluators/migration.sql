ALTER TABLE "CompetencyProgram"
  ADD COLUMN "requiresAuthorizedEvaluator" boolean NOT NULL DEFAULT false;

CREATE TABLE "CompetencyEvaluatorAuthorization" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "programId" uuid NOT NULL,
  "employeeId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "fileId" uuid NOT NULL,
  "basis" text NOT NULL CHECK (length(btrim("basis")) BETWEEN 1 AND 1000),
  "revokedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId", "programId") REFERENCES "CompetencyProgram"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("organizationId", "fileId") REFERENCES "FileObject"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetencyEvaluatorAuthorization_active_idx"
  ON "CompetencyEvaluatorAuthorization"("organizationId", "programId", "userId") WHERE "revokedAt" IS NULL;
