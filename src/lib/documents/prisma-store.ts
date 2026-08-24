import { db } from "../db";
import type {
  CreateDraftInput,
  DocumentLifecycleStore,
  StoredDocumentVersion,
} from "./service";

export class PrismaDocumentLifecycleStore implements DocumentLifecycleStore {
  async createDraft(
    input: CreateDraftInput & { actorUserId: string },
  ): Promise<StoredDocumentVersion> {
    return db.$transaction(async (transaction) => {
      const document = await transaction.document.create({
        data: {
          organizationId: input.organizationId,
          documentTypeId: input.documentTypeId,
          documentNumber: input.documentNumber.trim(),
          title: input.title.trim(),
        },
      });
      const version = await transaction.documentVersion.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          versionNumber: input.versionNumber,
          revisionLabel: input.revisionLabel.trim(),
          authoredByUserId: input.actorUserId,
          contentHash: input.contentHash,
          changeSummary: input.changeSummary.trim(),
        },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "DOCUMENT_DRAFT_CREATED",
          entityType: "DocumentVersion",
          entityId: version.id,
          metadata: {
            documentId: document.id,
            versionNumber: input.versionNumber,
            revisionLabel: input.revisionLabel.trim(),
            contentHash: input.contentHash,
          },
        },
      });
      return version;
    });
  }

  async findVersion(
    organizationId: string,
    versionId: string,
  ): Promise<StoredDocumentVersion | null> {
    return db.documentVersion.findFirst({
      where: { organizationId, id: versionId },
      select: {
        id: true,
        organizationId: true,
        documentId: true,
        status: true,
        lockVersion: true,
      },
    });
  }

  async applyTransition(
    input: Parameters<DocumentLifecycleStore["applyTransition"]>[0],
  ): Promise<boolean> {
    try {
      return await db.$transaction(async (transaction) => {
      if (input.command === "SUBMIT") {
        const definition = await transaction.workflowDefinition.findFirst({
          where: {
            organizationId: input.organizationId,
            key: "document-approval",
            active: true,
          },
          orderBy: { version: "desc" },
        });
        if (!definition) {
          throw new DocumentConfigurationError("An active document-approval workflow is required");
        }
        const workflow = await transaction.workflowInstance.create({
          data: {
            organizationId: input.organizationId,
            workflowDefinitionId: definition.id,
            entityType: "DocumentVersion",
            entityId: input.versionId,
            entityVersion: String(input.expectedLockVersion + 1),
            state: "REVIEW",
          },
        });
        await transaction.workflowTask.create({
          data: {
            organizationId: input.organizationId,
            workflowInstanceId: workflow.id,
            stepKey: "REVIEW",
          },
        });
      }

      if (input.command === "APPROVE" || input.command === "REJECT") {
        const workflow = await transaction.workflowInstance.findFirst({
          where: {
            organizationId: input.organizationId,
            entityType: "DocumentVersion",
            entityId: input.versionId,
            status: "ACTIVE",
          },
          orderBy: { startedAt: "desc" },
        });
        if (!workflow) throw new DocumentConfigurationError("An active review workflow is required");
        await transaction.workflowTask.updateMany({
          where: {
            organizationId: input.organizationId,
            workflowInstanceId: workflow.id,
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          data: {
            status: "COMPLETED",
            completedAt: input.occurredAt,
            decision: input.command,
            comments: input.reason,
          },
        });
        await transaction.workflowInstance.update({
          where: { id: workflow.id },
          data: {
            status: "COMPLETED",
            state: input.command === "APPROVE" ? "APPROVED" : "REJECTED",
            completedAt: input.occurredAt,
            lockVersion: { increment: 1 },
          },
        });
      }

      if (input.command === "MAKE_EFFECTIVE") {
        const document = await transaction.document.findFirst({
          where: { organizationId: input.organizationId, id: input.documentId },
          select: { currentVersionId: true },
        });
        if (!document) throw new ConcurrentTransitionError();
        if (document.currentVersionId && document.currentVersionId !== input.versionId) {
          const superseded = await transaction.documentVersion.updateMany({
            where: {
              organizationId: input.organizationId,
              id: document.currentVersionId,
              status: "EFFECTIVE",
            },
            data: {
              status: "SUPERSEDED",
              supersededAt: input.occurredAt,
              lockVersion: { increment: 1 },
            },
          });
          if (superseded.count !== 1) throw new ConcurrentTransitionError();
        }
      }

      const changed = await transaction.documentVersion.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.versionId,
          documentId: input.documentId,
          status: input.from,
          lockVersion: input.expectedLockVersion,
        },
        data: {
          status: input.to,
          lockVersion: { increment: 1 },
          effectiveAt: input.to === "EFFECTIVE" ? input.occurredAt : undefined,
        },
      });
      if (changed.count !== 1) throw new ConcurrentTransitionError();

      if (input.command === "MAKE_EFFECTIVE") {
        await transaction.document.update({
          where: { id: input.documentId },
          data: { currentVersionId: input.versionId },
        });
      }

      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: `DOCUMENT_VERSION_${input.command}`,
          entityType: "DocumentVersion",
          entityId: input.versionId,
          reason: input.reason,
          occurredAt: input.occurredAt,
          metadata: {
            documentId: input.documentId,
            from: input.from,
            to: input.to,
            priorLockVersion: input.expectedLockVersion,
          },
        },
      });
      return true;
      });
    } catch (error) {
      if (error instanceof ConcurrentTransitionError) return false;
      throw error;
    }
  }
}

class ConcurrentTransitionError extends Error {}

export class DocumentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentConfigurationError";
  }
}
