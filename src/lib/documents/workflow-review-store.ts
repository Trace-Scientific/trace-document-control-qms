import { db } from "../db";
import type { WorkflowReviewStore } from "./workflow-review";
export class PrismaWorkflowReviewStore implements WorkflowReviewStore {
  async transfer(input: Parameters<WorkflowReviewStore["transfer"]>[0]) {
    return db.$transaction(async (transaction) => {
      const task = await transaction.workflowTask.findFirst({
        where: {
          id: input.taskId,
          organizationId: input.organizationId,
          status: { in: input.mode === "DELEGATE" ? ["IN_PROGRESS"] : ["PENDING", "IN_PROGRESS"] },
          ...(input.mode === "DELEGATE" ? { assigneeUserId: input.actorUserId } : {}),
          stepKey: { startsWith: "REVIEW_" },
          workflow: { status: "ACTIVE", state: "REVIEW", entityType: "DocumentVersion" },
        },
        select: { id: true, assigneeUserId: true, dueAt: true, workflow: { select: { entityId: true } } },
      });
      if (!task || task.assigneeUserId === input.newAssigneeUserId) return false;
      const eligible = await transaction.user.findFirst({
        where: {
          id: input.newAssigneeUserId,
          organizationId: input.organizationId,
          status: "ACTIVE",
          roles: { some: { role: { permissions: { some: { permission: { key: "document.review" } } } } } },
        },
        select: { id: true },
      });
      if (!eligible) return false;
      const changed = await transaction.workflowTask.updateMany({
        where: { id: task.id, organizationId: input.organizationId, assigneeUserId: task.assigneeUserId },
        data: { assigneeUserId: input.newAssigneeUserId },
      });
      if (changed.count !== 1) return false;
      await transaction.notificationOutbox.create({
        data: {
          organizationId: input.organizationId,
          recipientUserId: input.newAssigneeUserId,
          eventKey: `document-review-${input.mode.toLowerCase()}:${task.id}:${input.newAssigneeUserId}`,
          templateKey: input.mode === "DELEGATE" ? "DOCUMENT_REVIEW_DELEGATED" : "DOCUMENT_REVIEW_REASSIGNED",
          payload: { taskId: task.id, documentVersionId: task.workflow.entityId, dueAt: task.dueAt?.toISOString() },
        },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: input.mode === "DELEGATE" ? "DOCUMENT_REVIEW_DELEGATED" : "DOCUMENT_REVIEW_REASSIGNED",
          entityType: "WorkflowTask",
          entityId: task.id,
          reason: input.reason,
          occurredAt: input.occurredAt,
          metadata: { previousAssigneeUserId: task.assigneeUserId, newAssigneeUserId: input.newAssigneeUserId },
        },
      });
      return true;
    });
  }
  async decide(input: Parameters<WorkflowReviewStore["decide"]>[0]) {
    try {
      return await db.$transaction(async (transaction) => {
        const task = await transaction.workflowTask.findFirst({
          where: {
            organizationId: input.organizationId,
            id: input.taskId,
            assigneeUserId: input.reviewerUserId,
            status: "IN_PROGRESS",
            workflow: {
              status: "ACTIVE",
              state: "REVIEW",
              entityType: "DocumentVersion",
            },
          },
          select: {
            id: true,
            workflowInstanceId: true,
            workflow: { select: { entityId: true } },
          },
        });
        if (!task) return null;
        const claimed = await transaction.workflowTask.updateMany({
          where: {
            organizationId: input.organizationId,
            id: task.id,
            status: "IN_PROGRESS",
            assigneeUserId: input.reviewerUserId,
          },
          data: {
            status: "COMPLETED",
            completedAt: input.occurredAt,
            decision: input.decision,
            comments: input.comment,
          },
        });
        if (claimed.count !== 1) return null;
        if (input.decision === "REQUEST_CHANGES") {
          await transaction.workflowTask.updateMany({
            where: {
              organizationId: input.organizationId,
              workflowInstanceId: task.workflowInstanceId,
              status: "PENDING",
            },
            data: { status: "CANCELLED" },
          });
          await transaction.workflowInstance.update({
            where: { id: task.workflowInstanceId },
            data: {
              status: "COMPLETED",
              state: "CHANGES_REQUESTED",
              completedAt: input.occurredAt,
              lockVersion: { increment: 1 },
            },
          });
          const changed = await transaction.documentVersion.updateMany({
            where: {
              organizationId: input.organizationId,
              id: task.workflow.entityId,
              status: "IN_REVIEW",
            },
            data: { status: "DRAFT", lockVersion: { increment: 1 } },
          });
          if (changed.count !== 1) throw new WorkflowStateConflict();
          await transaction.auditEvent.create({
            data: {
              organizationId: input.organizationId,
              actorUserId: input.reviewerUserId,
              action: "DOCUMENT_REVIEW_CHANGES_REQUESTED",
              entityType: "DocumentVersion",
              entityId: task.workflow.entityId,
              reason: input.comment,
              occurredAt: input.occurredAt,
              metadata: {
                taskId: task.id,
                workflowId: task.workflowInstanceId,
              },
            },
          });
          return "RETURNED_TO_DRAFT";
        }
        const next = await transaction.workflowTask.findFirst({
          where: {
            organizationId: input.organizationId,
            workflowInstanceId: task.workflowInstanceId,
            status: "PENDING",
            stepKey: { startsWith: "REVIEW_" },
          },
          orderBy: { createdAt: "asc" },
        });
        if (next) {
          await transaction.workflowTask.update({
            where: { id: next.id },
            data: { status: "IN_PROGRESS" },
          });
          if (next.assigneeUserId)
            await transaction.notificationOutbox.create({
              data: {
                organizationId: input.organizationId,
                recipientUserId: next.assigneeUserId,
                eventKey: `document-review-stage-ready:${next.id}`,
                templateKey: "DOCUMENT_REVIEW_STAGE_READY",
                payload: {
                  documentVersionId: task.workflow.entityId,
                  taskId: next.id,
                  dueAt: next.dueAt?.toISOString(),
                },
              },
            });
          await transaction.auditEvent.create({
            data: {
              organizationId: input.organizationId,
              actorUserId: input.reviewerUserId,
              action: "DOCUMENT_REVIEW_STAGE_ACCEPTED",
              entityType: "DocumentVersion",
              entityId: task.workflow.entityId,
              reason: input.comment,
              occurredAt: input.occurredAt,
              metadata: { taskId: task.id, nextTaskId: next.id },
            },
          });
          return "NEXT_REVIEW";
        }
        await transaction.workflowTask.create({
          data: {
            organizationId: input.organizationId,
            workflowInstanceId: task.workflowInstanceId,
            stepKey: "APPROVAL",
            status: "PENDING",
          },
        });
        await transaction.workflowInstance.update({
          where: { id: task.workflowInstanceId },
          data: { state: "APPROVAL", lockVersion: { increment: 1 } },
        });
        await transaction.auditEvent.create({
          data: {
            organizationId: input.organizationId,
            actorUserId: input.reviewerUserId,
            action: "DOCUMENT_REVIEW_STAGES_COMPLETED",
            entityType: "DocumentVersion",
            entityId: task.workflow.entityId,
            reason: input.comment,
            occurredAt: input.occurredAt,
            metadata: { taskId: task.id, workflowId: task.workflowInstanceId },
          },
        });
        return "AWAITING_APPROVAL";
      });
    } catch (error) {
      if (error instanceof WorkflowStateConflict) return null;
      throw error;
    }
  }
  async notifyOverdue(organizationId: string, occurredAt: Date) {
    const tasks = await db.workflowTask.findMany({
      where: {
        organizationId,
        status: "IN_PROGRESS",
        dueAt: { lt: occurredAt },
        assigneeUserId: { not: null },
        workflow: {
          status: "ACTIVE",
          state: "REVIEW",
          entityType: "DocumentVersion",
        },
      },
      select: {
        id: true,
        assigneeUserId: true,
        dueAt: true,
        workflow: { select: { entityId: true } },
      },
      take: 500,
    });
    let created = 0;
    for (const task of tasks) {
      try {
        await db.$transaction([
          db.notificationOutbox.create({
            data: {
              organizationId,
              recipientUserId: task.assigneeUserId!,
              eventKey: `workflow-review-overdue:${task.id}:${task.dueAt!.toISOString()}`,
              templateKey: "DOCUMENT_REVIEW_ASSIGNMENT_OVERDUE",
              payload: {
                taskId: task.id,
                documentVersionId: task.workflow.entityId,
                dueAt: task.dueAt!.toISOString(),
              },
            },
          }),
          db.auditEvent.create({
            data: {
              organizationId,
              action: "DOCUMENT_REVIEW_OVERDUE_NOTIFICATION_CREATED",
              entityType: "WorkflowTask",
              entityId: task.id,
              occurredAt,
              metadata: {
                documentVersionId: task.workflow.entityId,
                dueAt: task.dueAt!.toISOString(),
              },
            },
          }),
        ]);
        created++;
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            (error as { code?: string }).code === "P2002"
          )
        )
          throw error;
      }
    }
    return created;
  }
  async notifyAllOverdue(occurredAt: Date) {
    const organizations = await db.workflowTask.findMany({
      where: { status: "IN_PROGRESS", dueAt: { lt: occurredAt }, workflow: { status: "ACTIVE", state: "REVIEW" } },
      distinct: ["organizationId"],
      select: { organizationId: true },
      take: 1000,
    });
    let created = 0;
    for (const organization of organizations)
      created += await this.notifyOverdue(organization.organizationId, occurredAt);
    return created;
  }
}
class WorkflowStateConflict extends Error {}
