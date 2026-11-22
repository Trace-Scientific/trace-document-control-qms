-- Ambiguous in-flight deliveries require manual reconciliation; never blindly retry.
ALTER TABLE "TrainingRenewalNotificationDelivery"
  DROP CONSTRAINT "TrainingRenewalNotificationDelivery_status_check";
ALTER TABLE "TrainingRenewalNotificationDelivery"
  ADD CONSTRAINT "TrainingRenewalNotificationDelivery_status_check"
  CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'REVIEW_REQUIRED'));
CREATE INDEX "TrainingRenewalNotificationDelivery_review_idx"
  ON "TrainingRenewalNotificationDelivery" ("organizationId", "updatedAt")
  WHERE "status" = 'REVIEW_REQUIRED';
