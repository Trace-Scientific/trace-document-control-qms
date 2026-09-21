-- Link customer Help intake records to separately governed controlled support cases.
-- The link does not itself grant tenant access.

ALTER TABLE "SupportCase"
  ADD COLUMN "sourceHelpSupportRequestId" UUID;

CREATE UNIQUE INDEX "SupportCase_sourceHelpSupportRequestId_key"
  ON "SupportCase"("sourceHelpSupportRequestId")
  WHERE "sourceHelpSupportRequestId" IS NOT NULL;

ALTER TABLE "SupportCase"
  ADD CONSTRAINT "SupportCase_sourceHelpSupportRequestId_fkey"
  FOREIGN KEY ("sourceHelpSupportRequestId") REFERENCES "HelpSupportRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
