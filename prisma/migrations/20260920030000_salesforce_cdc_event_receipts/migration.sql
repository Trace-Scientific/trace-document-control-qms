CREATE TABLE "PlatformSalesforceCdcEventReceipt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscriptionId" UUID NOT NULL REFERENCES "PlatformSalesforceCdcSubscription"("id") ON DELETE RESTRICT,
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "topic" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "schemaId" TEXT NOT NULL,
  "replayIdBase64" TEXT NOT NULL,
  "payloadBytes" BYTEA NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSalesforceCdcEventReceipt_topic_check"
    CHECK (char_length("topic") BETWEEN 7 AND 240),
  CONSTRAINT "PlatformSalesforceCdcEventReceipt_event_id_check"
    CHECK (char_length("eventId") BETWEEN 1 AND 512),
  CONSTRAINT "PlatformSalesforceCdcEventReceipt_schema_id_check"
    CHECK (char_length("schemaId") BETWEEN 1 AND 512),
  CONSTRAINT "PlatformSalesforceCdcEventReceipt_replay_check"
    CHECK (char_length("replayIdBase64") BETWEEN 4 AND 4096),
  CONSTRAINT "PlatformSalesforceCdcEventReceipt_payload_size_check"
    CHECK (octet_length("payloadBytes") BETWEEN 1 AND 3145728),
  CONSTRAINT "PlatformSalesforceCdcEventReceipt_sha256_check"
    CHECK ("payloadSha256" ~ '^[a-f0-9]{64}$'),
  UNIQUE ("subscriptionId","eventId","replayIdBase64")
);

CREATE INDEX "PlatformSalesforceCdcEventReceipt_subscription_received_idx"
  ON "PlatformSalesforceCdcEventReceipt" ("subscriptionId","receivedAt");

CREATE INDEX "PlatformSalesforceCdcEventReceipt_connection_received_idx"
  ON "PlatformSalesforceCdcEventReceipt" ("connectionId","receivedAt");
