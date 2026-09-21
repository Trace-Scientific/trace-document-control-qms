-- Allow controlled manual releases to remain unscheduled while DRAFT.
ALTER TABLE "UserManualRelease"
  ALTER COLUMN "effectiveAt" DROP NOT NULL;

CREATE OR REPLACE FUNCTION require_manual_release_effective_at_on_publish() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'PUBLISHED' AND NEW."effectiveAt" IS NULL THEN
    RAISE EXCEPTION 'Published UserManualRelease requires an effectiveAt timestamp';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserManualRelease_require_effective_at"
BEFORE INSERT OR UPDATE ON "UserManualRelease"
FOR EACH ROW EXECUTE FUNCTION require_manual_release_effective_at_on_publish();
