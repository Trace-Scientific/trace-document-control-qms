-- Per-tenant training notification preferences. Delivery remains disabled until an audited sender is implemented.
CREATE TABLE "TrainingNotificationPreference" (
  "organizationId" UUID NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "remind30Days" BOOLEAN NOT NULL DEFAULT TRUE,
  "remind7Days" BOOLEAN NOT NULL DEFAULT TRUE,
  "remindOverdue" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedByUserId" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingNotificationPreference_organization_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingNotificationPreference_user_fkey"
    FOREIGN KEY ("organizationId", "updatedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT
);
