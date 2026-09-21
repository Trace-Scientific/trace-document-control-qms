-- Trace-side support assignment and SLA tracking.
-- Control-plane operational metadata only; does not grant tenant access.

ALTER TABLE "HelpSupportRequest"
  ADD COLUMN "assignedToIdentityId" UUID,
  ADD COLUMN "assignedAt" TIMESTAMPTZ(3),
  ADD COLUMN "responseDueAt" TIMESTAMPTZ(3),
  ADD COLUMN "closureDueAt" TIMESTAMPTZ(3);

ALTER TABLE "HelpSupportRequest"
  ADD CONSTRAINT "HelpSupportRequest_assignedToIdentityId_fkey"
  FOREIGN KEY ("assignedToIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HelpSupportRequest"
  ADD CONSTRAINT "HelpSupportRequest_assignment_consistency_check"
  CHECK (
    ("assignedToIdentityId" IS NULL AND "assignedAt" IS NULL)
    OR ("assignedToIdentityId" IS NOT NULL AND "assignedAt" IS NOT NULL)
  );

CREATE INDEX "HelpSupportRequest_assignee_status_idx"
  ON "HelpSupportRequest"("assignedToIdentityId","status","submittedAt");

CREATE INDEX "HelpSupportRequest_response_due_idx"
  ON "HelpSupportRequest"("responseDueAt")
  WHERE "status" = 'OPEN';

CREATE INDEX "HelpSupportRequest_closure_due_idx"
  ON "HelpSupportRequest"("closureDueAt")
  WHERE "status" <> 'CLOSED';
