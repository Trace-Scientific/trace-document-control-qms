-- Platform commercial proposal storage. Does not alter existing subscription or entitlement tables.
CREATE TABLE "TraceQmsCommercialProposal" (
  "id" UUID NOT NULL,
  "customerName" TEXT NOT NULL,
  "priceVersion" TEXT NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "calculationSnapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdByIdentityId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TraceQmsCommercialProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TraceQmsCommercialProposal_status_createdAt_idx"
  ON "TraceQmsCommercialProposal" ("status", "createdAt");

CREATE TABLE "TraceQmsCommercialProposalEvent" (
  "id" UUID NOT NULL,
  "proposalId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "actorIdentityId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TraceQmsCommercialProposalEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TraceQmsCommercialProposalEvent_proposalId_revision_key"
  ON "TraceQmsCommercialProposalEvent" ("proposalId", "revision");
CREATE INDEX "TraceQmsCommercialProposalEvent_actorIdentityId_occurredAt_idx"
  ON "TraceQmsCommercialProposalEvent" ("actorIdentityId", "occurredAt");
ALTER TABLE "TraceQmsCommercialProposalEvent"
  ADD CONSTRAINT "TraceQmsCommercialProposalEvent_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "TraceQmsCommercialProposal"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
