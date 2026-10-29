CREATE TABLE "TraceQmsCommercialAuditScan" (
  "id" UUID NOT NULL,
  "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "findingCount" INTEGER NOT NULL,
  "affectedProposals" INTEGER NOT NULL,
  "findingsByCode" JSONB NOT NULL,
  "initiatedByIdentityId" UUID NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
  CONSTRAINT "TraceQmsCommercialAuditScan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TraceQmsCommercialAuditScan_counts_check" CHECK ("findingCount" >= 0 AND "affectedProposals" >= 0),
  CONSTRAINT "TraceQmsCommercialAuditScan_trigger_check" CHECK ("trigger" IN ('MANUAL', 'SCHEDULED'))
);
CREATE INDEX "TraceQmsCommercialAuditScan_checkedAt_idx" ON "TraceQmsCommercialAuditScan"("checkedAt");
