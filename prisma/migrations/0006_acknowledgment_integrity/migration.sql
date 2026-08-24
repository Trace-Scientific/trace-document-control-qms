CREATE UNIQUE INDEX "ElectronicSignature_organizationId_authenticationEventId_key"
ON "ElectronicSignature"("organizationId", "authenticationEventId");

CREATE FUNCTION validate_acknowledgment_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "DocumentVersion" version WHERE version."organizationId"=NEW."organizationId" AND version."id"=NEW."documentVersionId" AND version."documentId"=NEW."documentId" AND version."status"='EFFECTIVE') THEN RAISE EXCEPTION 'Only an effective document version can be distributed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "User" recipient WHERE recipient."organizationId"=NEW."organizationId" AND recipient."id"=NEW."assignedToUserId" AND recipient."status"='ACTIVE') THEN RAISE EXCEPTION 'Acknowledgment recipient must be active'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AcknowledgmentAssignment_validate" BEFORE INSERT ON "AcknowledgmentAssignment" FOR EACH ROW EXECUTE FUNCTION validate_acknowledgment_assignment();

CREATE FUNCTION protect_acknowledgment_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Acknowledgment evidence cannot be deleted'; END IF;
  IF OLD."organizationId" <> NEW."organizationId" OR OLD."documentId" <> NEW."documentId" OR OLD."documentVersionId" <> NEW."documentVersionId" OR OLD."assignedToUserId" <> NEW."assignedToUserId" OR OLD."assignedByUserId" <> NEW."assignedByUserId" OR OLD."assignedAt" <> NEW."assignedAt" OR OLD."dueAt" IS DISTINCT FROM NEW."dueAt" OR OLD."status" <> 'ASSIGNED' OR NEW."status" NOT IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Acknowledgment assignment identity is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AcknowledgmentAssignment_protect_evidence" BEFORE UPDATE OR DELETE ON "AcknowledgmentAssignment" FOR EACH ROW EXECUTE FUNCTION protect_acknowledgment_evidence();

CREATE FUNCTION validate_acknowledgment_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AcknowledgmentAssignment" assignment JOIN "ElectronicSignature" signature ON signature."organizationId"=assignment."organizationId" AND signature."id"=NEW."signatureId" WHERE assignment."organizationId"=NEW."organizationId" AND assignment."id"=NEW."assignmentId" AND assignment."status"='COMPLETED' AND signature."meaning"='ACKNOWLEDGED' AND signature."signerUserId"=assignment."assignedToUserId" AND signature."documentVersionId"=assignment."documentVersionId") THEN RAISE EXCEPTION 'Completion signature does not match assignment recipient and version'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AcknowledgmentCompletion_validate" BEFORE INSERT ON "AcknowledgmentCompletion" FOR EACH ROW EXECUTE FUNCTION validate_acknowledgment_completion();
CREATE TRIGGER "AcknowledgmentCompletion_no_update_delete" BEFORE UPDATE OR DELETE ON "AcknowledgmentCompletion" FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
