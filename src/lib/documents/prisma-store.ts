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
          contentText: input.contentText,
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

  async createRevision(
    input: Parameters<DocumentLifecycleStore["createRevision"]>[0],
  ) {
    return db.$transaction(async (transaction) => {
      const source = await transaction.documentVersion.findFirst({
        where: {
          organizationId: input.organizationId,
          id: input.sourceVersionId,
          status: { in: ["EFFECTIVE", "SUPERSEDED"] },
        },
        select: { documentId: true },
      });
      if (!source)
        throw new DocumentConfigurationError(
          "An effective or superseded source version is required",
        );
      const active = await transaction.documentVersion.count({
        where: {
          organizationId: input.organizationId,
          documentId: source.documentId,
          status: { in: ["DRAFT", "IN_REVIEW", "APPROVED"] },
        },
      });
      if (active)
        throw new DocumentConfigurationError(
          "Complete the existing in-process revision first",
        );
      const maximum = await transaction.documentVersion.aggregate({
          where: {
            organizationId: input.organizationId,
            documentId: source.documentId,
          },
          _max: { versionNumber: true },
        }),
        version = await transaction.documentVersion.create({
          data: {
            organizationId: input.organizationId,
            documentId: source.documentId,
            versionNumber: (maximum._max.versionNumber ?? 0) + 1,
            revisionLabel: input.revisionLabel.trim(),
            authoredByUserId: input.actorUserId,
            contentHash: input.contentHash,
            contentText: input.contentText,
            changeSummary: input.changeSummary.trim(),
          },
        });
      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "DOCUMENT_SUCCESSOR_REVISION_CREATED",
          entityType: "DocumentVersion",
          entityId: version.id,
          occurredAt: input.occurredAt,
          metadata: {
            documentId: source.documentId,
            sourceVersionId: input.sourceVersionId,
            versionNumber: version.versionNumber,
            revisionLabel: version.revisionLabel,
            contentHash: version.contentHash,
          },
        },
      });
      return version;
    });
  }

  async updateDraft(
    input: Parameters<DocumentLifecycleStore["updateDraft"]>[0],
  ): Promise<boolean> {
    return db.$transaction(async (transaction) => {
      const changed = await transaction.documentVersion.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.versionId,
          status: "DRAFT",
          lockVersion: input.expectedLockVersion,
        },
        data: {
          contentText: input.contentText,
          contentHash: input.contentHash,
          changeSummary: input.changeSummary.trim(),
          lockVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) return false;
      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "DOCUMENT_DRAFT_UPDATED",
          entityType: "DocumentVersion",
          entityId: input.versionId,
          occurredAt: input.occurredAt,
          metadata: {
            priorLockVersion: input.expectedLockVersion,
            contentHash: input.contentHash,
          },
        },
      });
      return true;
    });
  }

  async applyTransition(
    input: Parameters<DocumentLifecycleStore["applyTransition"]>[0],
  ): Promise<boolean> {
    const reviewers = input.assigneeUserIds?.length
      ? input.assigneeUserIds
      : input.assigneeUserId
        ? [input.assigneeUserId]
        : [];
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
            throw new DocumentConfigurationError(
              "An active document-approval workflow is required",
            );
          }
          const workflow = await transaction.workflowInstance.create({
            data: {
              organizationId: input.organizationId,
              workflowDefinitionId: definition.id,
              entityType: "DocumentVersion",
              entityId: input.versionId,
              entityVersion: String(input.expectedLockVersion + 1),
              state: reviewers.length ? "REVIEW" : "APPROVAL",
            },
          });
          if (reviewers.length) {
            const eligible = await transaction.user.count({
              where: {
                organizationId: input.organizationId,
                id: { in: reviewers },
                status: "ACTIVE",
                roles: {
                  some: {
                    role: {
                      permissions: {
                        some: {
                          permission: {
                            key: {
                              in: ["document.review", "document.approve"],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            });
            if (eligible !== reviewers.length)
              throw new DocumentConfigurationError(
                "One or more selected reviewers are not eligible",
              );
          }
          const stages = reviewers.length ? reviewers : [null];
          for (const [index, reviewerId] of stages.entries())
            await transaction.workflowTask.create({
              data: {
                organizationId: input.organizationId,
                workflowInstanceId: workflow.id,
                stepKey: reviewerId ? `REVIEW_${index + 1}` : "APPROVAL",
                assigneeUserId: reviewerId,
                status: reviewerId && index === 0 ? "IN_PROGRESS" : "PENDING",
                dueAt: input.dueAt,
                comments: input.comment,
              },
            });
          for (const reviewerId of reviewers)
            await transaction.notificationOutbox.create({
              data: {
                organizationId: input.organizationId,
                recipientUserId: reviewerId,
                eventKey: `document-review-assigned:${workflow.id}:${reviewerId}`,
                templateKey: "DOCUMENT_REVIEW_ASSIGNED",
                payload: {
                  documentVersionId: input.versionId,
                  workflowId: workflow.id,
                  dueAt: input.dueAt?.toISOString(),
                },
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
          if (!workflow)
            throw new DocumentConfigurationError(
              "An active review workflow is required",
            );
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

        let reviewDueAt: Date | undefined;
        if (input.command === "MAKE_EFFECTIVE") {
          const document = await transaction.document.findFirst({
            where: {
              organizationId: input.organizationId,
              id: input.documentId,
            },
            select: { currentVersionId: true },
          });
          if (!document) throw new ConcurrentTransitionError();
          if (
            document.currentVersionId &&
            document.currentVersionId !== input.versionId
          ) {
            await transaction.documentReviewTask.updateMany({
              where: {
                organizationId: input.organizationId,
                documentVersionId: document.currentVersionId,
                status: "PENDING",
              },
              data: { status: "CANCELLED" },
            });
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
          const documentType = await transaction.documentType.findFirst({
            where: {
              organizationId: input.organizationId,
              documents: { some: { id: input.documentId } },
            },
            select: { reviewMonths: true },
          });
          if (!documentType?.reviewMonths)
            throw new DocumentConfigurationError(
              "A positive review interval is required before a document can become effective",
            );
          reviewDueAt = addMonthsUtc(
            input.occurredAt,
            documentType.reviewMonths,
          );
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
            effectiveAt:
              input.to === "EFFECTIVE" ? input.occurredAt : undefined,
            reviewDueAt,
          },
        });
        if (changed.count !== 1) throw new ConcurrentTransitionError();

        if (input.command === "MAKE_EFFECTIVE") {
          await transaction.document.update({
            where: { id: input.documentId },
            data: { currentVersionId: input.versionId },
          });
          await transaction.documentReviewTask.create({
            data: {
              organizationId: input.organizationId,
              documentId: input.documentId,
              documentVersionId: input.versionId,
              dueAt: reviewDueAt!,
            },
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
              assigneeUserId: input.assigneeUserId,
              assigneeUserIds: reviewers,
              dueAt: input.dueAt?.toISOString(),
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

function addMonthsUtc(value: Date, months: number): Date {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export class DocumentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentConfigurationError";
  }
}
