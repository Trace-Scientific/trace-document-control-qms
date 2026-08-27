ALTER TABLE "Organization" ADD COLUMN "loginCode" TEXT;

UPDATE "Organization"
SET "loginCode" = CASE
  WHEN "legalName" = 'Orange County Labs' THEN 'orange-county-labs'
  ELSE lower(regexp_replace("id"::text, '[^a-z0-9]+', '-', 'g'))
END;

ALTER TABLE "Organization" ALTER COLUMN "loginCode" SET NOT NULL;
CREATE UNIQUE INDEX "Organization_loginCode_key" ON "Organization"("loginCode");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_loginCode_format"
  CHECK ("loginCode" ~ '^[a-z][a-z0-9-]{2,49}$');

