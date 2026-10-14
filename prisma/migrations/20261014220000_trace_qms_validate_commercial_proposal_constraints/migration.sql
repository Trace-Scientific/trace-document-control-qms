-- Validate existing commercial proposal rows against the previously installed
-- NOT VALID constraints. PostgreSQL aborts the migration if legacy data fails
-- any check; no existing proposal or event rows are modified or deleted.
ALTER TABLE "TraceQmsCommercialProposal"
  VALIDATE CONSTRAINT "TraceQmsCommercialProposal_status_check";

ALTER TABLE "TraceQmsCommercialProposal"
  VALIDATE CONSTRAINT "TraceQmsCommercialProposal_revision_check";

ALTER TABLE "TraceQmsCommercialProposalEvent"
  VALIDATE CONSTRAINT "TraceQmsCommercialProposalEvent_revision_check";

ALTER TABLE "TraceQmsCommercialProposalEvent"
  VALIDATE CONSTRAINT "TraceQmsCommercialProposalEvent_transition_check";

ALTER TABLE "TraceQmsCommercialProposalEvent"
  VALIDATE CONSTRAINT "TraceQmsCommercialProposalEvent_reason_check";
