-- Execution reservations are internal and disabled unless tenant scheduling is enabled.
-- A reservation is not proof that notifications were delivered.
CREATE TABLE "TrainingNotificationScheduleRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "reservedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMPTZ(3),
  "actorUserId" UUID NOT NULL,
  "claimedCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TrainingNotificationScheduleRun_status_check"
    CHECK ("status" IN ('RESERVED', 'FINISHED', 'REVIEW_REQUIRED')),
  CONSTRAINT "TrainingNotificationScheduleRun_count_check" CHECK ("claimedCount" >= 0),
  CONSTRAINT "TrainingNotificationScheduleRun_finish_check"
    CHECK (("status" = 'RESERVED' AND "finishedAt" IS NULL)
      OR ("status" <> 'RESERVED' AND "finishedAt" IS NOT NULL)),
  CONSTRAINT "TrainingNotificationScheduleRun_schedule_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "TrainingNotificationSchedule"("organizationId") ON DELETE RESTRICT,
  CONSTRAINT "TrainingNotificationScheduleRun_user_fkey"
    FOREIGN KEY ("organizationId", "actorUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "TrainingNotificationScheduleRun_one_active"
  ON "TrainingNotificationScheduleRun" ("organizationId") WHERE "status" = 'RESERVED';
CREATE INDEX "TrainingNotificationScheduleRun_history"
  ON "TrainingNotificationScheduleRun" ("organizationId", "reservedAt" DESC);
