CREATE TABLE "PlatformSalesforceCdcSubscription" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" UUID NOT NULL REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT,
  "topic" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISABLED',
  "replayIdBase64" TEXT,
  "lastEventAt" TIMESTAMPTZ(3),
  "lastKeepaliveAt" TIMESTAMPTZ(3),
  "lastCheckpointAt" TIMESTAMPTZ(3),
  "lastFailureCode" TEXT,
  "claimedAt" TIMESTAMPTZ(3),
  "claimedBy" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSalesforceCdcSubscription_status_check"
    CHECK ("status" IN ('DISABLED','READY','RUNNING','DEGRADED')),
  CONSTRAINT "PlatformSalesforceCdcSubscription_topic_check"
    CHECK (char_length("topic") BETWEEN 7 AND 240),
  CONSTRAINT "PlatformSalesforceCdcSubscription_replay_check"
    CHECK ("replayIdBase64" IS NULL OR char_length("replayIdBase64") <= 4096),
  CONSTRAINT "PlatformSalesforceCdcSubscription_failure_check"
    CHECK ("lastFailureCode" IS NULL OR char_length("lastFailureCode") <= 160),
  CONSTRAINT "PlatformSalesforceCdcSubscription_claimed_by_check"
    CHECK ("claimedBy" IS NULL OR char_length("claimedBy") <= 160),
  UNIQUE ("connectionId","topic")
);

CREATE INDEX "PlatformSalesforceCdcSubscription_status_idx"
  ON "PlatformSalesforceCdcSubscription" ("status","updatedAt");

CREATE INDEX "PlatformSalesforceCdcSubscription_connection_idx"
  ON "PlatformSalesforceCdcSubscription" ("connectionId","status");
