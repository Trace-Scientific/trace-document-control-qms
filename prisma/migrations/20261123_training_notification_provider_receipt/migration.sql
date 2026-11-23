-- Accepted provider receipts are stored on the ledger, separate from general audit metadata.
ALTER TABLE "TrainingRenewalNotificationDelivery"
  ADD COLUMN "providerMessageId" VARCHAR(512),
  ADD CONSTRAINT "TrainingRenewalNotificationDelivery_receipt_check"
    CHECK ("providerMessageId" IS NULL OR ("status" = 'SENT' AND length("providerMessageId") > 0));
