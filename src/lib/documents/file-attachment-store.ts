import { db } from "../db";
import type { DocumentFileAttachmentStore } from "./file-attachment";

export class PrismaDocumentFileAttachmentStore implements DocumentFileAttachmentStore {
  async findVersion(organizationId: string, versionId: string) {
    return db.documentVersion.findFirst({
      where: { organizationId, id: versionId },
      select: { id: true, organizationId: true, status: true, lockVersion: true, fileId: true },
    });
  }
  async findFile(organizationId: string, fileId: string) {
    return db.fileObject.findFirst({
      where: { organizationId, id: fileId },
      select: { id: true, organizationId: true, status: true, sha256: true, originalName: true },
    });
  }
  async attach(input: Parameters<DocumentFileAttachmentStore["attach"]>[0]) {
    return db.$transaction(async (transaction) => {
      const file = await transaction.fileObject.findFirst({
        where: { organizationId: input.organizationId, id: input.fileId, status: "AVAILABLE" },
        select: { id: true, sha256: true },
      });
      if (!file || file.sha256 !== input.sha256) return false;
      const changed = await transaction.documentVersion.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.versionId,
          status: "DRAFT",
          lockVersion: input.expectedLockVersion,
          fileId: null,
        },
        data: { fileId: input.fileId, lockVersion: { increment: 1 } },
      });
      if (changed.count !== 1) return false;
      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "DOCUMENT_FILE_ATTACHED",
          entityType: "DocumentVersion",
          entityId: input.versionId,
          newHash: input.sha256,
          occurredAt: input.occurredAt,
          metadata: {
            fileId: input.fileId,
            originalName: input.originalName,
            sha256: input.sha256,
            priorLockVersion: input.expectedLockVersion,
          },
        },
      });
      return true;
    });
  }
}
