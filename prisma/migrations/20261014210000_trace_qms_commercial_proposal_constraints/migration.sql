-- Defense in depth for commercial proposal states and approval events.
-- Additive checks: PostgreSQL enforces these for new and updated rows.
-- NOT VALID avoids blocking deployment on legacy rows pending an explicit validation pass.
ALTER TABLE "TraceQmsCommercialProposal"
  ADD CONSTRAINT "TraceQmsCommercialProposal_status_check"
  CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')) NOT VALID;

ALTER TABLE "TraceQmsCommercialProposal"
  ADD CONSTRAINT "TraceQmsCommercialProposal_revision_check"
  CHECK ("revision" >= 0) NOT VALID;

ALTER TABLE "TraceQmsCommercialProposalEvent"
  ADD CONSTRAINT "TraceQmsCommercialProposalEvent_revision_check"
  CHECK ("revision" > 0) NOT VALID;

ALTER TABLE "TraceQmsCommercialProposalEvent"
  ADD CONSTRAINT "TraceQmsCommercialProposalEvent_transition_check"
  CHECK (
    ("action" = 'SUBMIT' AND "fromStatus" = 'DRAFT' AND "toStatus" = 'SUBMITTED')
    OR ("action" = 'APPROVE' AND "fromStatus" = 'SUBMITTED' AND "toStatus" = 'APPROVED')
    OR ("action" = 'REJECT' AND "fromStatus" = 'SUBMITTED' AND "toStatus" = 'REJECTED')
  ) NOT VALID;

ALTER TABLE "TraceQmsCommercialProposalEvent"
  ADD CONSTRAINT "TraceQmsCommercialProposalEvent_reason_check"
  CHECK (length(btrim("reason")) BETWEEN 1 AND 1000) NOT VALID;
