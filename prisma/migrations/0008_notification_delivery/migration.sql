ALTER TYPE "NotificationStatus" ADD VALUE 'DEAD_LETTER';
ALTER TABLE "NotificationOutbox"
  ADD COLUMN "claimedAt" TIMESTAMPTZ(3),
  ADD COLUMN "claimedBy" TEXT,
  ADD COLUMN "lastAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN "readAt" TIMESTAMPTZ(3),
  ADD COLUMN "deadLetteredAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "NotificationOutbox_delivery_state_check" CHECK (
    ("status"='PROCESSING') = ("claimedAt" IS NOT NULL AND "claimedBy" IS NOT NULL)
    AND ("status"='SENT') = ("sentAt" IS NOT NULL)
    AND ("status"='DEAD_LETTER') = ("deadLetteredAt" IS NOT NULL)
    AND ("readAt" IS NULL OR ("channel"='IN_APP' AND "status"='SENT' AND "recipientUserId" IS NOT NULL))
  );
CREATE INDEX "NotificationOutbox_claim_idx" ON "NotificationOutbox"("status","availableAt","claimedAt");
