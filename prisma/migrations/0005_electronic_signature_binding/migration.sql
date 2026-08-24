CREATE OR REPLACE FUNCTION validate_signature_authentication_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AuthenticationEvent" authentication
    WHERE authentication."organizationId" = NEW."organizationId"
      AND authentication."id" = NEW."authenticationEventId"
      AND authentication."userId" = NEW."signerUserId"
      AND authentication."eventType" = 'REAUTHENTICATION'
      AND authentication."outcome" = 'SUCCESS'
      AND authentication."occurredAt" <= NEW."signedAt"
      AND authentication."validUntil" >= NEW."signedAt"
  ) THEN
    RAISE EXCEPTION 'Signature requires current successful signer reauthentication';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ElectronicSignature_validate_authentication"
BEFORE INSERT ON "ElectronicSignature"
FOR EACH ROW EXECUTE FUNCTION validate_signature_authentication_event();
