import { Prisma } from "@prisma/client";
import { db } from "../db";

type AttachedFile = { id: string; storageKey: string; originalName: string; sha256: string };

export async function findQualityEvidenceFile(
  organizationId: string,
  eventId: string,
  fileId: string,
  canReadDocuments: boolean,
) {
  const [file] = await db.$queryRaw<AttachedFile[]>(Prisma.sql`
    SELECT f."id", f."storageKey", f."originalName", f."sha256"
    FROM "FileObject" f
    WHERE f."organizationId" = ${organizationId}::uuid AND f."id" = ${fileId}::uuid
      AND f."status" = 'AVAILABLE'
      AND (
        EXISTS (
          SELECT 1 FROM "QualityEventInvestigation" i
          WHERE i."organizationId" = f."organizationId" AND i."eventId" = ${eventId}::uuid AND i."evidenceFileId" = f."id"
        ) OR EXISTS (
          SELECT 1 FROM "QualityCapaAction" a
          WHERE a."organizationId" = f."organizationId" AND a."eventId" = ${eventId}::uuid AND a."completionEvidenceFileId" = f."id"
        ) OR EXISTS (
          SELECT 1 FROM "QualityEffectivenessCheck" e
          JOIN "QualityCapaAction" a
            ON a."organizationId" = e."organizationId" AND a."eventId" = e."eventId" AND a."id" = e."capaActionId"
          WHERE e."organizationId" = f."organizationId" AND e."eventId" = ${eventId}::uuid AND e."evidenceFileId" = f."id"
        )
      )
      AND (${canReadDocuments} OR EXISTS (
        SELECT 1 FROM "AuditEvent" uploaded
        WHERE uploaded."organizationId" = f."organizationId"
          AND uploaded."entityType" = 'FileObject' AND uploaded."entityId" = f."id"
          AND uploaded."action" = 'EVIDENCE_FILE_UPLOADED_PENDING_SCAN'
          AND uploaded."newHash" = f."sha256"
          AND uploaded."metadata"->>'evidenceDomain' = 'QUALITY'
      ))
  `);
  return file ?? null;
}
