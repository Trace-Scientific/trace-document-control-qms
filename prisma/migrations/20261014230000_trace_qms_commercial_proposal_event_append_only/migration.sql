-- Guard commercial proposal approval history against accidental or application-level edits.
-- This is not tamper-proof against privileged database owners/superusers.
CREATE FUNCTION trace_qms_reject_commercial_proposal_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Commercial proposal approval events are append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER trace_qms_commercial_proposal_event_append_only
BEFORE UPDATE OR DELETE ON "TraceQmsCommercialProposalEvent"
FOR EACH ROW
EXECUTE FUNCTION trace_qms_reject_commercial_proposal_event_mutation();
