import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  AuthenticationRequiredError,
} from "@/lib/security/authenticated-request";
import { evaluateAuthorization } from "@/lib/security/authorization";
import { PrismaDeliveryStore } from "@/lib/notifications/prisma-store";
import { NotificationInboxService } from "@/lib/notifications/service";
import { PrismaReviewStore } from "@/lib/reviews/prisma-store";
import { DocumentReviewService } from "@/lib/reviews/service";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request),
      organizationId = context.organizationId;
    const user = await db.user.findUniqueOrThrow({
      where: { id: context.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const canManageReviews = evaluateAuthorization(context, {
      organizationId,
      permission: "document.review.manage",
    }).allowed;
    const canManageNotifications = evaluateAuthorization(context, {
      organizationId,
      permission: "notification.manage",
    }).allowed;
    const canManageAccess = evaluateAuthorization(context, {
      organizationId,
      permission: "administration.manage",
    }).allowed;
    const canReadDocuments = evaluateAuthorization(context, {
      organizationId,
      permission: "document.read",
    }).allowed;
    const canCreateDocuments = evaluateAuthorization(context, {
      organizationId,
      permission: "document.create",
    }).allowed;
    const canSubmitDocuments = evaluateAuthorization(context, {
      organizationId,
      permission: "document.submit",
    }).allowed;
    const canReviewDocuments = evaluateAuthorization(context, {
      organizationId,
      permission: "document.review",
    }).allowed;
    const canApproveDocuments = evaluateAuthorization(context, {
      organizationId,
      permission: "document.approve",
    }).allowed;
    const canMakeDocumentsEffective = evaluateAuthorization(context, {
      organizationId,
      permission: "document.make_effective",
    }).allowed;
    const deliveryStore = new PrismaDeliveryStore();
    const notifications = await new NotificationInboxService(
      deliveryStore,
    ).list(context, organizationId);
    const [reviews, failures] = await Promise.all([
      canManageReviews
        ? new DocumentReviewService(new PrismaReviewStore()).listOutstanding(
            context,
            organizationId,
          )
        : Promise.resolve([]),
      canManageNotifications
        ? new NotificationInboxService(deliveryStore).failures(
            context,
            organizationId,
          )
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      data: {
        organizationId,
        userId: context.userId,
        user,
        capabilities: {
          canManageReviews,
          canManageNotifications,
          canManageAccess,
          canReadDocuments,
          canCreateDocuments,
          canSubmitDocuments,
          canReviewDocuments,
          canApproveDocuments,
          canMakeDocumentsEffective,
        },
        notifications,
        reviews,
        failures,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    return NextResponse.json(
      { error: "Unable to load workspace dashboard" },
      { status: 500 },
    );
  }
}
