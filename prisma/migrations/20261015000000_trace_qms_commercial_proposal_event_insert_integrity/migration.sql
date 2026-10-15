-- Validate new approval events against the proposal's committed transition state.
-- Existing rows are not rewritten. Privileged database owners can still bypass triggers.
CREATE FUNCTION trace_qms_validate_commercial_proposal_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  proposal_record RECORD;
BEGIN
  SELECT "revision", "status", "createdByIdentityId"
    INTO proposal_record
    FROM "TraceQmsCommercialProposal"
    WHERE "id" = NEW."proposalId"
    FOR SHARE;

  IF NOT FOUND
    OR proposal_record."revision" <> NEW."revision"
    OR proposal_record."status" <> NEW."toStatus"
  THEN
    RAISE EXCEPTION 'Commercial proposal approval event does not match proposal state'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."action" IN ('APPROVE', 'REJECT')
    AND proposal_record."createdByIdentityId" = NEW."actorIdentityId"
  THEN
    RAISE EXCEPTION 'Commercial proposal creator cannot approve or reject'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trace_qms_commercial_proposal_event_insert_integrity
BEFORE INSERT ON "TraceQmsCommercialProposalEvent"
FOR EACH ROW
EXECUTE FUNCTION trace_qms_validate_commercial_proposal_event_insert();
