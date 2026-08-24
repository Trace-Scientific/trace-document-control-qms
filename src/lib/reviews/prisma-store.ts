import { db } from "../db";
import type { ReviewStore } from "./service";

export class PrismaReviewStore implements ReviewStore {
  async listDue(organizationId: string, through: Date) {
    const rows = await db.documentReviewTask.findMany({ where: { organizationId, status: "PENDING", dueAt: { lte: through }, documentVersion: { status: "EFFECTIVE" } }, select: { id: true, documentId: true, documentVersionId: true, dueAt: true, document: { select: { currentVersionId: true } } }, orderBy: { dueAt: "asc" } });
    return rows.filter((row) => row.document.currentVersionId === row.documentVersionId).map((row) => ({ id: row.id, documentId: row.documentId, documentVersionId: row.documentVersionId, dueAt: row.dueAt }));
  }
  async listOutstanding(organizationId: string, now: Date) {
    const rows = await db.documentReviewTask.findMany({ where: { organizationId, status: "PENDING", documentVersion: { status: "EFFECTIVE" } }, select: { id: true, documentId: true, documentVersionId: true, dueAt: true, document: { select: { currentVersionId: true } } }, orderBy: { dueAt: "asc" } });
    return rows.filter((row) => row.document.currentVersionId === row.documentVersionId).map((row) => ({ id: row.id, documentId: row.documentId, documentVersionId: row.documentVersionId, dueAt: row.dueAt, overdue: row.dueAt < now }));
  }
  async escalate(input: Parameters<ReviewStore["escalate"]>[0]) {
    try {
      await db.$transaction(async (transaction) => {
        const task = await transaction.documentReviewTask.findFirst({ where: { organizationId: input.organizationId, id: input.taskId, status: "PENDING", documentVersion: { status: "EFFECTIVE" } }, select: { id: true, documentId: true, documentVersionId: true, dueAt: true, document: { select: { currentVersionId: true } } } });
        if (!task || task.document.currentVersionId !== task.documentVersionId) throw new SkipEscalation();
        await transaction.documentReviewEscalation.create({ data: { organizationId: input.organizationId, reviewTaskId: input.taskId, level: input.level, escalatedAt: input.occurredAt } });
        const recipients = await transaction.user.findMany({ where: { organizationId: input.organizationId, status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: "document.review.manage" } } } } } } }, select: { id: true } });
        if (recipients.length) await transaction.notificationOutbox.createMany({ data: recipients.map((recipient) => ({ organizationId: input.organizationId, recipientUserId: recipient.id, eventKey: input.eventKey, templateKey: "DOCUMENT_REVIEW_OVERDUE", payload: { reviewTaskId: task.id, documentId: task.documentId, documentVersionId: task.documentVersionId, dueAt: task.dueAt.toISOString(), level: input.level }, availableAt: input.occurredAt })) });
        await transaction.auditEvent.create({ data: { organizationId: input.organizationId, action: "DOCUMENT_REVIEW_ESCALATED", entityType: "DocumentReviewTask", entityId: task.id, occurredAt: input.occurredAt, metadata: { level: input.level, eventKey: input.eventKey } } });
      });
      return true;
    } catch (error) { if (error instanceof SkipEscalation || isUniqueViolation(error)) return false; throw error; }
  }
  async complete(input: Parameters<ReviewStore["complete"]>[0]) {
    return db.$transaction(async (transaction) => {
      const task = await transaction.documentReviewTask.findFirst({ where: { organizationId: input.organizationId, id: input.taskId, status: "PENDING", documentVersion: { status: "EFFECTIVE" } }, select: { documentVersionId: true, document: { select: { currentVersionId: true } } } });
      if (!task || task.document.currentVersionId !== task.documentVersionId) return false;
      const changed = await transaction.documentReviewTask.updateMany({ where: { organizationId: input.organizationId, id: input.taskId, status: "PENDING" }, data: { status: "COMPLETED", completedAt: input.completedAt, completedByUserId: input.actorUserId, outcome: input.outcome, comments: input.comments } });
      if (changed.count !== 1) return false;
      await transaction.auditEvent.create({ data: { organizationId: input.organizationId, actorUserId: input.actorUserId, action: "DOCUMENT_PERIODIC_REVIEW_COMPLETED", entityType: "DocumentReviewTask", entityId: input.taskId, occurredAt: input.completedAt, reason: input.comments, metadata: { outcome: input.outcome } } });
      return true;
    });
  }
}
class SkipEscalation extends Error {}
function isUniqueViolation(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002"); }
