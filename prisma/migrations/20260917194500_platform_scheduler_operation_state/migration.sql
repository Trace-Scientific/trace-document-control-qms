-- PR 23: scheduler execution ownership and alert-routing hardening.
-- This table records mutable operational lease/heartbeat state only; it does not grant authority.

CREATE TABLE "PlatformScheduledOperationState" (
  "operationKey" TEXT PRIMARY KEY,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMPTZ,
  "lastStartedAt" TIMESTAMPTZ,
  "lastSucceededAt" TIMESTAMPTZ,
  "lastFailedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastResult" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformScheduledOperationState_failure_count_check" CHECK ("consecutiveFailures" >= 0),
  CONSTRAINT "PlatformScheduledOperationState_error_check" CHECK ("lastError" IS NULL OR char_length("lastError") <= 1000)
);
