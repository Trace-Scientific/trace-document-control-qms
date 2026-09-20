CREATE TABLE "PlatformSalesforceCdcNormalizedEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "receiptId" UUID NOT NULL REFERENCES "PlatformSalesforceCdcEventReceipt"("id") ON DELETE RESTRICT,
  "schemaId" TEXT NOT NULL,
  "schemaSha256" TEXT NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "entityName" TEXT NOT NULL,
  "recordIds" JSONB NOT NULL,
  "changeType" TEXT NOT NULL,
  "changeOrigin" TEXT,
  "transactionKey" TEXT NOT NULL,
  "sequenceNumber" BIGINT NOT NULL,
  "commitTimestamp" BIGINT NOT NULL,
  "commitUser" TEXT NOT NULL,
  "commitNumber" BIGINT NOT NULL,
  "changedFields" JSONB NOT NULL,
  "nulledFields" JSONB NOT NULL,
  "diffFields" JSONB NOT NULL,
  "normalizedSha256" TEXT NOT NULL,
  "normalizedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_schema_hash_check"
    CHECK ("schemaSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_payload_hash_check"
    CHECK ("payloadSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_normalized_hash_check"
    CHECK ("normalizedSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_entity_check"
    CHECK (char_length("entityName") BETWEEN 1 AND 256),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_change_type_check"
    CHECK ("changeType" IN (
      'CREATE','UPDATE','DELETE','UNDELETE','SNAPSHOT',
      'GAP_CREATE','GAP_UPDATE','GAP_DELETE','GAP_UNDELETE','GAP_OVERFLOW'
    )),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_sequence_check"
    CHECK ("sequenceNumber" >= 1),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_commit_timestamp_check"
    CHECK ("commitTimestamp" >= 0),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_commit_number_check"
    CHECK ("commitNumber" >= 0),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_record_ids_array_check"
    CHECK (jsonb_typeof("recordIds") = 'array'),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_changed_fields_array_check"
    CHECK (jsonb_typeof("changedFields") = 'array'),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_nulled_fields_array_check"
    CHECK (jsonb_typeof("nulledFields") = 'array'),
  CONSTRAINT "PlatformSalesforceCdcNormalizedEvent_diff_fields_array_check"
    CHECK (jsonb_typeof("diffFields") = 'array'),
  UNIQUE ("receiptId")
);

CREATE INDEX "PlatformSalesforceCdcNormalizedEvent_entity_commit_idx"
  ON "PlatformSalesforceCdcNormalizedEvent" ("entityName","commitTimestamp");

CREATE INDEX "PlatformSalesforceCdcNormalizedEvent_change_commit_idx"
  ON "PlatformSalesforceCdcNormalizedEvent" ("changeType","commitTimestamp");

CREATE OR REPLACE FUNCTION "prevent_platform_salesforce_cdc_normalized_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PlatformSalesforceCdcNormalizedEvent rows are immutable';
END;
$$;

CREATE TRIGGER "PlatformSalesforceCdcNormalizedEvent_immutable_update"
BEFORE UPDATE ON "PlatformSalesforceCdcNormalizedEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_platform_salesforce_cdc_normalized_event_mutation"();

CREATE TRIGGER "PlatformSalesforceCdcNormalizedEvent_immutable_delete"
BEFORE DELETE ON "PlatformSalesforceCdcNormalizedEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_platform_salesforce_cdc_normalized_event_mutation"();
