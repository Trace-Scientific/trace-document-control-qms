CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING','COMPLETED','CANCELLED');
CREATE TYPE "DocumentReviewOutcome" AS ENUM ('NO_CHANGE','REVISION_REQUIRED','RETIREMENT_REQUIRED');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP','EMAIL');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING','PROCESSING','SENT','FAILED');

CREATE TABLE "DocumentReviewTask" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL,
  "documentId" UUID NOT NULL, "documentVersionId" UUID NOT NULL, "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING', "completedAt" TIMESTAMPTZ(3),
  "completedByUserId" UUID, "outcome" "DocumentReviewOutcome", "comments" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentReviewTask_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "DocumentReviewTask_document_fkey" FOREIGN KEY ("organizationId","documentId") REFERENCES "Document"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "DocumentReviewTask_version_fkey" FOREIGN KEY ("organizationId","documentId","documentVersionId") REFERENCES "DocumentVersion"("organizationId","documentId","id") ON DELETE RESTRICT,
  CONSTRAINT "DocumentReviewTask_user_fkey" FOREIGN KEY ("organizationId","completedByUserId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "DocumentReviewTask_completion_check" CHECK (("status"='COMPLETED') = ("completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL AND "outcome" IS NOT NULL))
);
CREATE UNIQUE INDEX "DocumentReviewTask_organizationId_id_key" ON "DocumentReviewTask"("organizationId","id");
CREATE UNIQUE INDEX "DocumentReviewTask_organizationId_documentVersionId_key" ON "DocumentReviewTask"("organizationId","documentVersionId");
CREATE INDEX "DocumentReviewTask_due_idx" ON "DocumentReviewTask"("organizationId","status","dueAt");

CREATE TABLE "DocumentReviewEscalation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "reviewTaskId" UUID NOT NULL,
  "level" INTEGER NOT NULL, "escalatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentReviewEscalation_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "DocumentReviewEscalation_task_fkey" FOREIGN KEY ("organizationId","reviewTaskId") REFERENCES "DocumentReviewTask"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "DocumentReviewEscalation_level_check" CHECK ("level" > 0)
);
CREATE UNIQUE INDEX "DocumentReviewEscalation_org_id_key" ON "DocumentReviewEscalation"("organizationId","id");
CREATE UNIQUE INDEX "DocumentReviewEscalation_once_key" ON "DocumentReviewEscalation"("organizationId","reviewTaskId","level");

CREATE TABLE "NotificationOutbox" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" UUID NOT NULL, "eventKey" TEXT NOT NULL,
  "recipientUserId" UUID, "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP', "templateKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMPTZ(3), "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationOutbox_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationOutbox_user_fkey" FOREIGN KEY ("organizationId","recipientUserId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationOutbox_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "NotificationOutbox_dedupe_key" ON "NotificationOutbox"("organizationId","eventKey","recipientUserId","channel") NULLS NOT DISTINCT;
CREATE INDEX "NotificationOutbox_delivery_idx" ON "NotificationOutbox"("organizationId","status","availableAt");

CREATE FUNCTION protect_document_review_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Document review evidence cannot be deleted'; END IF;
  IF OLD."organizationId"<>NEW."organizationId" OR OLD."documentId"<>NEW."documentId" OR OLD."documentVersionId"<>NEW."documentVersionId" OR OLD."dueAt"<>NEW."dueAt" OR OLD."createdAt"<>NEW."createdAt" OR OLD."status"<>'PENDING' OR NEW."status" NOT IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Document review identity is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "DocumentReviewTask_protect" BEFORE UPDATE OR DELETE ON "DocumentReviewTask" FOR EACH ROW EXECUTE FUNCTION protect_document_review_evidence();

CREATE FUNCTION protect_review_escalation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Review escalation evidence is append-only'; END; $$;
CREATE TRIGGER "DocumentReviewEscalation_protect" BEFORE UPDATE OR DELETE ON "DocumentReviewEscalation" FOR EACH ROW EXECUTE FUNCTION protect_review_escalation();
