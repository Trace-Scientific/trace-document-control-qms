-- Separate scheduler authorization from reminder preferences.
-- No cron, dispatcher or outbound sender is activated by this table.
CREATE TABLE "TrainingNotificationSchedule" (
  "organizationId" UUID NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "hourUtc" INTEGER NOT NULL DEFAULT 14,
  "minimumIntervalHours" INTEGER NOT NULL DEFAULT 24,
  "lastRunAt" TIMESTAMPTZ(3),
  "updatedByUserId" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingNotificationSchedule_hour_check" CHECK ("hourUtc" BETWEEN 0 AND 23),
  CONSTRAINT "TrainingNotificationSchedule_interval_check" CHECK ("minimumIntervalHours" BETWEEN 24 AND 168),
  CONSTRAINT "TrainingNotificationSchedule_organization_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingNotificationSchedule_user_fkey"
    FOREIGN KEY ("organizationId", "updatedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT
);
