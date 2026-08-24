-- CreateEnum
CREATE TYPE "DocumentLifecycle" AS ENUM ('ACTIVE', 'RETIRED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "DocumentVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING_SCAN', 'AVAILABLE', 'QUARANTINED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureMeaning" AS ENUM ('AUTHORED', 'REVIEWED', 'APPROVED', 'ACKNOWLEDGED', 'COMPLETED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('VALID', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "AcknowledgmentStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LegalHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- DropForeignKey
ALTER TABLE "Department" DROP CONSTRAINT "Department_siteId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_roleId_fkey";

-- DropForeignKey
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_permissionId_fkey";

-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actorUserId_fkey";

-- DropIndex
DROP INDEX "Site_organizationId_idx";

-- DropIndex
DROP INDEX "Department_organizationId_idx";

-- DropIndex
DROP INDEX "User_organizationId_idx";

-- DropIndex
DROP INDEX "AuditEvent_entityType_entityId_idx";

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "lastLoginAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_pkey",
ADD COLUMN     "organizationId" UUID NOT NULL,
ALTER COLUMN "assignedAt" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY ("organizationId", "userId", "roleId");

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "requestId" UUID,
ALTER COLUMN "occurredAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "metadata" SET DEFAULT '{}';

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reviewMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lifecycleState" "DocumentLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "currentVersionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "revisionLabel" TEXT NOT NULL,
    "status" "DocumentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "authoredByUserId" UUID NOT NULL,
    "fileId" UUID,
    "contentHash" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3),
    "reviewDueAt" TIMESTAMPTZ(3),
    "supersededAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_SCAN',
    "uploadedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workflowDefinitionId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "entityVersion" TEXT,
    "state" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTask" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workflowInstanceId" UUID NOT NULL,
    "stepKey" TEXT NOT NULL,
    "assigneeUserId" UUID,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "decision" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectronicSignature" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "signerUserId" UUID NOT NULL,
    "workflowInstanceId" UUID,
    "documentVersionId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "entityVersion" TEXT NOT NULL,
    "meaning" "SignatureMeaning" NOT NULL,
    "meaningText" TEXT NOT NULL,
    "authenticationEventId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SignatureStatus" NOT NULL DEFAULT 'VALID',
    "invalidatedAt" TIMESTAMPTZ(3),
    "invalidationReason" TEXT,

    CONSTRAINT "ElectronicSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcknowledgmentAssignment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "documentVersionId" UUID NOT NULL,
    "assignedToUserId" UUID NOT NULL,
    "assignedByUserId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3),
    "status" "AcknowledgmentStatus" NOT NULL DEFAULT 'ASSIGNED',

    CONSTRAINT "AcknowledgmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcknowledgmentCompletion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "signatureId" UUID NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcknowledgmentCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recordType" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "retentionDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LegalHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedByUserId" UUID,
    "releasedAt" TIMESTAMPTZ(3),
    "releaseReason" TEXT,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_organizationId_id_key" ON "DocumentType"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_organizationId_code_key" ON "DocumentType"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Document_organizationId_lifecycleState_idx" ON "Document"("organizationId", "lifecycleState");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_id_key" ON "Document"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_documentNumber_key" ON "Document"("organizationId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_currentVersionId_key" ON "Document"("organizationId", "currentVersionId");

-- CreateIndex
CREATE INDEX "DocumentVersion_organizationId_status_effectiveAt_idx" ON "DocumentVersion"("organizationId", "status", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_organizationId_id_key" ON "DocumentVersion"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_organizationId_documentId_id_key" ON "DocumentVersion"("organizationId", "documentId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_organizationId_documentId_versionNumber_key" ON "DocumentVersion"("organizationId", "documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_organizationId_documentId_revisionLabel_key" ON "DocumentVersion"("organizationId", "documentId", "revisionLabel");

-- CreateIndex
CREATE INDEX "FileObject_organizationId_sha256_idx" ON "FileObject"("organizationId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_organizationId_id_key" ON "FileObject"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_organizationId_storageKey_key" ON "FileObject"("organizationId", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_organizationId_id_key" ON "WorkflowDefinition"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_organizationId_key_version_key" ON "WorkflowDefinition"("organizationId", "key", "version");

-- CreateIndex
CREATE INDEX "WorkflowInstance_organizationId_entityType_entityId_idx" ON "WorkflowInstance"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "WorkflowInstance_organizationId_status_state_idx" ON "WorkflowInstance"("organizationId", "status", "state");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowInstance_organizationId_id_key" ON "WorkflowInstance"("organizationId", "id");

-- CreateIndex
CREATE INDEX "WorkflowTask_organizationId_assigneeUserId_status_idx" ON "WorkflowTask"("organizationId", "assigneeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTask_organizationId_id_key" ON "WorkflowTask"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ElectronicSignature_organizationId_entityType_entityId_enti_idx" ON "ElectronicSignature"("organizationId", "entityType", "entityId", "entityVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicSignature_organizationId_id_key" ON "ElectronicSignature"("organizationId", "id");

-- CreateIndex
CREATE INDEX "AcknowledgmentAssignment_organizationId_assignedToUserId_st_idx" ON "AcknowledgmentAssignment"("organizationId", "assignedToUserId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcknowledgmentAssignment_organizationId_id_key" ON "AcknowledgmentAssignment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AcknowledgmentAssignment_organizationId_documentVersionId_a_key" ON "AcknowledgmentAssignment"("organizationId", "documentVersionId", "assignedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AcknowledgmentCompletion_organizationId_id_key" ON "AcknowledgmentCompletion"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AcknowledgmentCompletion_organizationId_assignmentId_key" ON "AcknowledgmentCompletion"("organizationId", "assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AcknowledgmentCompletion_organizationId_signatureId_key" ON "AcknowledgmentCompletion"("organizationId", "signatureId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_organizationId_id_key" ON "RetentionPolicy"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_organizationId_recordType_jurisdiction_key" ON "RetentionPolicy"("organizationId", "recordType", "jurisdiction");

-- CreateIndex
CREATE INDEX "LegalHold_organizationId_entityType_entityId_status_idx" ON "LegalHold"("organizationId", "entityType", "entityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LegalHold_organizationId_id_key" ON "LegalHold"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Site_organizationId_id_key" ON "Site"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Site_organizationId_name_key" ON "Site"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_id_key" ON "Department"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_siteId_name_key" ON "Department"("organizationId", "siteId", "name");

-- CreateIndex
CREATE INDEX "User_organizationId_status_idx" ON "User"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_id_key" ON "User"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "Role"("organizationId", "id");

-- CreateIndex
CREATE INDEX "UserRole_organizationId_roleId_idx" ON "UserRole"("organizationId", "roleId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_entityType_entityId_idx" ON "AuditEvent"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_correlationId_idx" ON "AuditEvent"("organizationId", "correlationId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_siteId_fkey" FOREIGN KEY ("organizationId", "siteId") REFERENCES "Site"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_organizationId_assignedBy_fkey" FOREIGN KEY ("organizationId", "assignedBy") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_documentTypeId_fkey" FOREIGN KEY ("organizationId", "documentTypeId") REFERENCES "DocumentType"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_currentVersionId_fkey" FOREIGN KEY ("organizationId", "currentVersionId") REFERENCES "DocumentVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "Document"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_organizationId_authoredByUserId_fkey" FOREIGN KEY ("organizationId", "authoredByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_organizationId_fileId_fkey" FOREIGN KEY ("organizationId", "fileId") REFERENCES "FileObject"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_organizationId_uploadedByUserId_fkey" FOREIGN KEY ("organizationId", "uploadedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_organizationId_workflowDefinitionId_fkey" FOREIGN KEY ("organizationId", "workflowDefinitionId") REFERENCES "WorkflowDefinition"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_organizationId_workflowInstanceId_fkey" FOREIGN KEY ("organizationId", "workflowInstanceId") REFERENCES "WorkflowInstance"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_organizationId_assigneeUserId_fkey" FOREIGN KEY ("organizationId", "assigneeUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_organizationId_signerUserId_fkey" FOREIGN KEY ("organizationId", "signerUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_organizationId_workflowInstanceId_fkey" FOREIGN KEY ("organizationId", "workflowInstanceId") REFERENCES "WorkflowInstance"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_organizationId_documentVersionId_fkey" FOREIGN KEY ("organizationId", "documentVersionId") REFERENCES "DocumentVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcknowledgmentAssignment" ADD CONSTRAINT "AcknowledgmentAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcknowledgmentAssignment" ADD CONSTRAINT "AcknowledgmentAssignment_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "Document"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcknowledgmentAssignment" ADD CONSTRAINT "AcknowledgmentAssignment_organizationId_documentId_documen_fkey" FOREIGN KEY ("organizationId", "documentId", "documentVersionId") REFERENCES "DocumentVersion"("organizationId", "documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcknowledgmentAssignment" ADD CONSTRAINT "AcknowledgmentAssignment_organizationId_assignedToUserId_fkey" FOREIGN KEY ("organizationId", "assignedToUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcknowledgmentAssignment" ADD CONSTRAINT "AcknowledgmentAssignment_organizationId_assignedByUserId_fkey" FOREIGN KEY ("organizationId", "assignedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcknowledgmentCompletion" ADD CONSTRAINT "AcknowledgmentCompletion_organizationId_assignmentId_fkey" FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "AcknowledgmentAssignment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcknowledgmentCompletion" ADD CONSTRAINT "AcknowledgmentCompletion_organizationId_signatureId_fkey" FOREIGN KEY ("organizationId", "signatureId") REFERENCES "ElectronicSignature"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_organizationId_releasedByUserId_fkey" FOREIGN KEY ("organizationId", "releasedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_actorUserId_fkey" FOREIGN KEY ("organizationId", "actorUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regulated-data integrity constraints
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_size_nonnegative" CHECK ("sizeBytes" >= 0);
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_sha256_format" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_hash_format" CHECK ("contentHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ElectronicSignature" ADD CONSTRAINT "ElectronicSignature_hash_format" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_days_positive" CHECK ("retentionDays" > 0);
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_release_consistency" CHECK (
  ("status" = 'ACTIVE' AND "releasedAt" IS NULL AND "releasedByUserId" IS NULL)
  OR ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL AND "releaseReason" IS NOT NULL)
);

-- Audit history is append-only at the database boundary.
CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are append-only';
END;
$$;
CREATE TRIGGER "AuditEvent_no_update_delete"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

-- Effective/superseded/retired document versions cannot be changed or deleted.
CREATE FUNCTION protect_controlled_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('EFFECTIVE', 'SUPERSEDED', 'RETIRED') THEN
    RAISE EXCEPTION 'Controlled document history cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('EFFECTIVE', 'SUPERSEDED', 'RETIRED')
     AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'Effective controlled document versions are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "DocumentVersion_protect_history"
BEFORE UPDATE OR DELETE ON "DocumentVersion"
FOR EACH ROW EXECUTE FUNCTION protect_controlled_document_version();

-- Signature evidence cannot be deleted and its signed payload cannot be rewritten.
CREATE FUNCTION protect_signature_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Electronic signature evidence cannot be deleted';
  END IF;
  IF NEW."organizationId" <> OLD."organizationId"
     OR NEW."signerUserId" <> OLD."signerUserId"
     OR NEW."entityType" <> OLD."entityType"
     OR NEW."entityId" <> OLD."entityId"
     OR NEW."entityVersion" <> OLD."entityVersion"
     OR NEW."meaning" <> OLD."meaning"
     OR NEW."authenticationEventId" <> OLD."authenticationEventId"
     OR NEW."payloadHash" <> OLD."payloadHash"
     OR NEW."signedAt" <> OLD."signedAt" THEN
    RAISE EXCEPTION 'Signed evidence fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ElectronicSignature_protect_evidence"
BEFORE UPDATE OR DELETE ON "ElectronicSignature"
FOR EACH ROW EXECUTE FUNCTION protect_signature_evidence();
