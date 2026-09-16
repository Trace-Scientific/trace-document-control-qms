-- PR 8: Platform Notifications & Reporting
-- Additive control-plane notification and commercial/operational reporting foundation.
-- Tenant QMS notification/reporting tables and tenant RBAC are intentionally not altered.

INSERT INTO "PlatformPermission" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.notification.read', 'Read platform notification inbox and delivery state.'),
  (gen_random_uuid(), 'platform.notification.manage', 'Create, monitor, and requeue platform notifications.'),
  (gen_random_uuid(), 'platform.reporting.read', 'Read platform commercial and operational reports.')
ON CONFLICT ("key") DO NOTHING;

CREATE TYPE "PlatformNotificationChannel" AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE "PlatformNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'DEAD_LETTER');

CREATE TABLE "PlatformNotification" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "notificationType" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "recipientIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "customerAccountId" UUID REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT,
  "channel" "PlatformNotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "status" "PlatformNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "dedupeKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMPTZ,
  "claimedBy" TEXT,
  "lastAttemptAt" TIMESTAMPTZ,
  "sentAt" TIMESTAMPTZ,
  "deadLetteredAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformNotification_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5),
  CONSTRAINT "PlatformNotification_state_check" CHECK (
    (("status" = 'PROCESSING') = ("claimedAt" IS NOT NULL AND "claimedBy" IS NOT NULL))
    AND (("status" = 'SENT') = ("sentAt" IS NOT NULL))
    AND (("status" = 'DEAD_LETTER') = ("deadLetteredAt" IS NOT NULL))
  )
);

CREATE UNIQUE INDEX "PlatformNotification_dedupe_key" ON "PlatformNotification"("dedupeKey") WHERE "dedupeKey" IS NOT NULL;
CREATE INDEX "PlatformNotification_recipient_status_created_idx" ON "PlatformNotification"("recipientIdentityId", "status", "createdAt" DESC);
CREATE INDEX "PlatformNotification_delivery_idx" ON "PlatformNotification"("status", "availableAt", "createdAt");
CREATE INDEX "PlatformNotification_customer_idx" ON "PlatformNotification"("customerAccountId", "createdAt" DESC);

CREATE TABLE "PlatformNotificationEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "notificationId" UUID NOT NULL REFERENCES "PlatformNotification"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "actorIdentityId" UUID REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "actorMembershipId" UUID REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlatformNotificationEvent_notification_idx" ON "PlatformNotificationEvent"("notificationId", "occurredAt");

CREATE TABLE "PlatformReportRun" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reportKey" TEXT NOT NULL,
  "parameters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "result" JSONB NOT NULL,
  "generatedByIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  "generatedByMembershipId" UUID NOT NULL REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlatformReportRun_key_generated_idx" ON "PlatformReportRun"("reportKey", "generatedAt" DESC);
CREATE INDEX "PlatformReportRun_actor_idx" ON "PlatformReportRun"("generatedByMembershipId", "generatedAt" DESC);

CREATE OR REPLACE FUNCTION prevent_platform_notification_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PlatformNotificationEvent rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PlatformNotificationEvent_append_only"
BEFORE UPDATE OR DELETE ON "PlatformNotificationEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_platform_notification_event_mutation();

CREATE OR REPLACE FUNCTION prevent_platform_report_run_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PlatformReportRun rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PlatformReportRun_append_only"
BEFORE UPDATE OR DELETE ON "PlatformReportRun"
FOR EACH ROW EXECUTE FUNCTION prevent_platform_report_run_mutation();
