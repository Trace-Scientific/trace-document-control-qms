-- A closed review remains excluded from delivery retries and retains its attempt history.
ALTER TABLE "TrainingRenewalNotificationDelivery"
  DROP CONSTRAINT "TrainingRenewalNotificationDelivery_status_check",
  ADD CONSTRAINT "TrainingRenewalNotificationDelivery_status_check"
    CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'REVIEW_REQUIRED', 'REVIEW_CLOSED'));
