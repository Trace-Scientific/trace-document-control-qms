import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
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
    return NextResponse.json({ data: {
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
