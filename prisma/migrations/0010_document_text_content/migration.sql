ALTER TABLE "DocumentVersion" ADD COLUMN "contentText" TEXT;

CREATE OR REPLACE FUNCTION protect_controlled_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('EFFECTIVE', 'SUPERSEDED', 'RETIRED') THEN RAISE EXCEPTION 'Controlled document history cannot be deleted'; END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('SUPERSEDED', 'RETIRED') AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN RAISE EXCEPTION 'Historical controlled document versions are immutable'; END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'EFFECTIVE' THEN
    IF NEW."status" <> 'SUPERSEDED' OR NEW."supersededAt" IS NULL OR NEW."lockVersion" <> OLD."lockVersion" + 1
       OR NEW."organizationId" <> OLD."organizationId" OR NEW."documentId" <> OLD."documentId"
       OR NEW."versionNumber" <> OLD."versionNumber" OR NEW."revisionLabel" <> OLD."revisionLabel"
       OR NEW."authoredByUserId" <> OLD."authoredByUserId" OR NEW."contentHash" <> OLD."contentHash"
       OR NEW."contentText" IS DISTINCT FROM OLD."contentText" OR NEW."changeSummary" <> OLD."changeSummary"
       OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt" OR NEW."reviewDueAt" IS DISTINCT FROM OLD."reviewDueAt"
       OR NEW."fileId" IS DISTINCT FROM OLD."fileId" OR NEW."createdAt" <> OLD."createdAt" THEN
      RAISE EXCEPTION 'Effective controlled document versions are immutable except for controlled supersession';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
