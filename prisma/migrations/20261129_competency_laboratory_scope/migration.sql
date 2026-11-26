CREATE TABLE "CompetencyTestSystem" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "code" text NOT NULL CHECK (length(btrim("code")) BETWEEN 1 AND 80),
  "name" text NOT NULL CHECK (length(btrim("name")) BETWEEN 1 AND 240),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId", "id"),
  UNIQUE ("organizationId", "code")
);

ALTER TABLE "CompetencyProgram"
  ADD COLUMN "equipmentId" uuid,
  ADD COLUMN "testSystemId" uuid,
  ADD CONSTRAINT "CompetencyProgram_equipment_fkey" FOREIGN KEY ("organizationId", "equipmentId")
    REFERENCES "Equipment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CompetencyProgram_testSystem_fkey" FOREIGN KEY ("organizationId", "testSystemId")
    REFERENCES "CompetencyTestSystem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CompetencyProgram_equipment_idx" ON "CompetencyProgram"("organizationId", "equipmentId") WHERE "equipmentId" IS NOT NULL;
CREATE INDEX "CompetencyProgram_testSystem_idx" ON "CompetencyProgram"("organizationId", "testSystemId") WHERE "testSystemId" IS NOT NULL;
