-- Idempotent delivery ledger for future controlled training renewal notifications.
-- No scheduler, sender, or automatic inserts are enabled by this migration.
CREATE TABLE "TrainingRenewalNotificationDelivery" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "completionId" UUID NOT NULL,
  "renewalDueDate" DATE NOT NULL,
  "reminderType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingRenewalNotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingRenewalNotificationDelivery_type_check"
    CHECK ("reminderType" IN ('DUE_30', 'DUE_7', 'OVERDUE')),
  CONSTRAINT "TrainingRenewalNotificationDelivery_status_check"
    CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  CONSTRAINT "TrainingRenewalNotificationDelivery_attempt_check"
    CHECK ("attemptCount" >= 0),
  CONSTRAINT "TrainingRenewalNotificationDelivery_sent_check"
    CHECK (("status" = 'SENT' AND "sentAt" IS NOT NULL) OR ("status" <> 'SENT' AND "sentAt" IS NULL)),
  CONSTRAINT "TrainingRenewalNotificationDelivery_employee_fkey"
    FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingRenewalNotificationDelivery_course_fkey"
    FOREIGN KEY ("organizationId", "courseId") REFERENCES "TrainingCourse"("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingRenewalNotificationDelivery_completion_fkey"
    FOREIGN KEY ("organizationId", "completionId") REFERENCES "TrainingRecord"("organizationId", "id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingRenewalNotificationDelivery_unique_reminder"
    UNIQUE ("organizationId", "employeeId", "courseId", "renewalDueDate", "reminderType")
);
CREATE INDEX "TrainingRenewalNotificationDelivery_retry_idx"
  ON "TrainingRenewalNotificationDelivery" ("organizationId", "status", "updatedAt");
CREATE INDEX "TrainingRenewalNotificationDelivery_employee_idx"
  ON "TrainingRenewalNotificationDelivery" ("organizationId", "employeeId", "createdAt" DESC);
