import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { db } from "@/lib/db";
import { evaluateAuthorization } from "@/lib/security/authorization";
import { DocumentReviewService } from "@/lib/reviews/service";
import { PrismaReviewStore } from "@/lib/reviews/prisma-store";
import { ApprovalAssignmentService } from "@/lib/documents/approval-assignment";
import { PrismaApprovalAssignmentStore } from "@/lib/documents/approval-assignment-store";
import { AcknowledgmentService } from "@/lib/acknowledgments/service";
import { PrismaAcknowledgmentStore } from "@/lib/acknowledgments/prisma-store";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const organizationId = context.organizationId;
    const reviewAccess = evaluateAuthorization(context, { organizationId, permission: "document.review.manage" }).allowed;
    const distributionAccess = evaluateAuthorization(context, { organizationId, permission: "document.distribute" }).allowed;
    if (!reviewAccess && !distributionAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const [reviews, approvals, acknowledgments] = await Promise.all([
      reviewAccess ? new DocumentReviewService(new PrismaReviewStore()).listOutstanding(context, organizationId) : null,
      reviewAccess ? new ApprovalAssignmentService(new PrismaApprovalAssignmentStore()).list(context, organizationId) : null,
      distributionAccess ? new AcknowledgmentService(new PrismaAcknowledgmentStore()).listOutstanding(context, organizationId) : null,
    ]);
    const technicalTasks = reviewAccess ? await db.workflowTask.findMany({ where: { organizationId, stepKey: { startsWith: "REVIEW_" }, status: "IN_PROGRESS", workflow: { organizationId, status: "ACTIVE", state: "REVIEW", entityType: "DocumentVersion" } }, select: { id: true, dueAt: true, assigneeUserId: true, workflow: { select: { entityId: true } } } }) : [];
    const technicalVersions = await db.documentVersion.findMany({ where: { organizationId, status: "IN_REVIEW", id: { in: technicalTasks.map(task => task.workflow.entityId) } }, select: { id: true, revisionLabel: true, document: { select: { documentNumber: true, title: true } } } });
    const technicalUsers = await db.user.findMany({ where: { organizationId, id: { in: technicalTasks.flatMap(task => task.assigneeUserId ? [task.assigneeUserId] : []) } }, select: { id: true, firstName: true, lastName: true } });
    const now = new Date();
    const technicalDetails = technicalTasks.flatMap(task => { const version = technicalVersions.find(row => row.id === task.workflow.entityId); if (!version) return []; const user = technicalUsers.find(row => row.id === task.assigneeUserId); return [{ id: task.id, document: version.document.documentNumber, title: version.document.title, revision: version.revisionLabel, action: "Technical review", assignee: user ? `${user.firstName} ${user.lastName}`.trim() : "Unassigned or unavailable", dueAt: task.dueAt, overdue: Boolean(task.dueAt && task.dueAt < now) }]; });
    const completionGroups = distributionAccess ? await db.acknowledgmentAssignment.groupBy({ by: ["status"], where: { organizationId, status: { in: ["ASSIGNED", "COMPLETED"] }, documentVersion: { status: "EFFECTIVE" } }, _count: { _all: true } }) : [];
    const completed = completionGroups.find(row => row.status === "COMPLETED")?._count._all ?? 0;
    const assigned = completionGroups.find(row => row.status === "ASSIGNED")?._count._all ?? 0;
    const versions = acknowledgments?.length ? await db.documentVersion.findMany({ where: { organizationId, id: { in: acknowledgments.map(row => row.documentVersionId) } }, select: { id: true, revisionLabel: true, document: { select: { documentNumber: true, title: true } } } }) : [];
    const recipients = acknowledgments?.length ? await db.user.findMany({ where: { organizationId, id: { in: acknowledgments.map(row => row.recipientUserId) } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const versionMap = new Map(versions.map(row => [row.id, row]));
    const recipientMap = new Map(recipients.map(row => [row.id, row]));
    return NextResponse.json({ data: {
      activeTechnicalReviews: reviewAccess ? technicalDetails.length : null,
      currentAcknowledgmentCompletion: distributionAccess && completed + assigned > 0 ? Math.round(1000 * completed / (completed + assigned)) / 10 : null,
      currentAcknowledgmentCompleted: distributionAccess ? completed : null,
      currentAcknowledgmentTotal: distributionAccess ? completed + assigned : null,
      details: [
        ...technicalDetails,
        ...(reviews ?? []).map(row => ({ id: row.id, document: row.documentNumber, title: row.title, revision: row.revisionLabel, action: "Periodic review", assignee: null, dueAt: row.dueAt, overdue: row.overdue })),
        ...(approvals?.tasks ?? []).map(row => ({ id: row.id, document: row.documentNumber, title: row.title, revision: row.revisionLabel, action: "Final approval", assignee: row.assigneeUserId ? approvals?.approvers.find(user => user.id === row.assigneeUserId)?.name ?? "Assigned (not currently eligible)" : "Unassigned", dueAt: null, overdue: false })),
        ...(acknowledgments ?? []).map(row => {
          const version = versionMap.get(row.documentVersionId);
          const recipient = recipientMap.get(row.recipientUserId);
          return { id: row.assignmentId, document: version?.document.documentNumber ?? "Unavailable", title: version?.document.title ?? "", revision: version?.revisionLabel ?? "", action: "Acknowledgment", assignee: recipient ? `${recipient.firstName} ${recipient.lastName}`.trim() || "Unnamed employee" : "Unavailable", dueAt: row.dueAt, overdue: row.overdue };
        }),
      ],
      periodicReviews: reviews === null ? null : reviews.length,
      overduePeriodicReviews: reviews === null ? null : reviews.filter(row => row.overdue).length,
      pendingApprovals: approvals === null ? null : approvals.tasks.length,
      pendingAcknowledgments: acknowledgments === null ? null : acknowledgments.length,
      overdueAcknowledgments: acknowledgments === null ? null : acknowledgments.filter(row => row.overdue).length,
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    return NextResponse.json({ error: "Unable to load document obligations" }, { status: 500 });
  }
}
