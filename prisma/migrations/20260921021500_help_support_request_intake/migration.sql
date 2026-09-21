-- Help Center customer support request intake
-- Tenant-scoped intake only. Does not grant or request controlled support access.

CREATE TYPE "HelpSupportRequestStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'CLOSED');

CREATE TABLE "HelpSupportRequest" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "submittedByUserId" UUID NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" "HelpSupportRequestStatus" NOT NULL DEFAULT 'OPEN',
  "applicationVersion" TEXT,
  "pageContext" TEXT,
  "browserFamily" TEXT,
  "correlationId" TEXT,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMPTZ(3),
  "closedAt" TIMESTAMPTZ(3),
  CONSTRAINT "HelpSupportRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HelpSupportRequest_organizationId_status_submittedAt_idx"
  ON "HelpSupportRequest"("organizationId","status","submittedAt");

ALTER TABLE "HelpSupportRequest"
  ADD CONSTRAINT "HelpSupportRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HelpSupportRequest"
  ADD CONSTRAINT "HelpSupportRequest_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HelpSupportRequest"
  ADD CONSTRAINT "HelpSupportRequest_category_check"
  CHECK ("category" IN ('GENERAL','ACCESS','DOCUMENTS','TRAINING','QUALITY','LABORATORY','REPORTING','TECHNICAL'));

ALTER TABLE "HelpSupportRequest"
  ADD CONSTRAINT "HelpSupportRequest_priority_check"
  CHECK ("priority" IN ('LOW','NORMAL','HIGH'));

ALTER TABLE "HelpSupportRequest"
  ADD CONSTRAINT "HelpSupportRequest_text_length_check"
  CHECK (
    char_length("subject") BETWEEN 3 AND 200
    AND char_length("description") BETWEEN 10 AND 4000
    AND ("applicationVersion" IS NULL OR char_length("applicationVersion") <= 120)
    AND ("pageContext" IS NULL OR char_length("pageContext") <= 120)
    AND ("browserFamily" IS NULL OR char_length("browserFamily") <= 120)
    AND ("correlationId" IS NULL OR char_length("correlationId") <= 160)
  );
