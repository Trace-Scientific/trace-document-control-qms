import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const pageSize = 25;

type ReviewRow = {
  id: string;
  employeeNumber: string;
  courseCode: string;
  courseTitle: string;
  renewalDueDate: string;
  reminderType: string;
  lastAttemptAt: Date | null;
  updatedAt: Date;
};

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });

    const params = request.nextUrl.searchParams;
    const pageValue = params.get("page") ?? "1";
    const page = Number(pageValue);
    if (params.size !== params.getAll("page").length || params.size > 1
      || !/^[1-9][0-9]*$/.test(pageValue) || !Number.isSafeInteger((page - 1) * pageSize)) {
      return NextResponse.json({ error: "Invalid review queue page" }, { status: 422 });
    }

    const rows = await db.$queryRaw<ReviewRow[]>(Prisma.sql`
      SELECT d."id", e."employeeNumber", c."code" AS "courseCode", c."title" AS "courseTitle",
        to_char(d."renewalDueDate", 'YYYY-MM-DD') AS "renewalDueDate",
        d."reminderType", d."lastAttemptAt", d."updatedAt"
      FROM "TrainingRenewalNotificationDelivery" d
      JOIN "Employee" e ON e."organizationId" = d."organizationId" AND e."id" = d."employeeId"
      JOIN "TrainingCourse" c ON c."organizationId" = d."organizationId" AND c."id" = d."courseId"
      WHERE d."organizationId" = ${context.organizationId}::uuid AND d."status" = 'REVIEW_REQUIRED'
      ORDER BY d."updatedAt" DESC, d."id" DESC
      LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
    `);

    return NextResponse.json(
      { data: rows.slice(0, pageSize), page, hasMore: rows.length > pageSize },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load reminders for review" }, { status: 500 });
  }
}

const closeReview = z.object({
  deliveryId: z.uuid(),
  disposition: z.enum([
    "PROVIDER_ACCEPTANCE_CONFIRMED",
    "PROVIDER_NON_ACCEPTANCE_CONFIRMED",
    "OUTCOME_UNCONFIRMED",
  ]),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return NextResponse.json({ error: "Expected a JSON review decision" }, { status: 415 });
    }
    const parsed = closeReview.safeParse(await request.json().catch(() => null));
    if (!parsed.success || request.nextUrl.searchParams.size > 0) {
      return NextResponse.json({ error: "Invalid review decision" }, { status: 422 });
    }
    const { deliveryId, disposition } = parsed.data;
    const { organizationId, userId } = context;
    const closed = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; attemptCount: number }>>(Prisma.sql`
        UPDATE "TrainingRenewalNotificationDelivery"
        SET "status" = 'REVIEW_CLOSED', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${deliveryId}::uuid
          AND "status" = 'REVIEW_REQUIRED'
        RETURNING "id", "attemptCount"
      `);
      const row = rows[0];
      if (!row) return false;

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: "TRAINING_NOTIFICATION_REVIEW_CLOSED",
          entityType: "TrainingRenewalNotificationDelivery",
          entityId: row.id,
          metadata: { disposition, attemptCount: row.attemptCount },
        },
      });
      return true;
    });
    if (!closed) {
      return NextResponse.json({ error: "Reminder is no longer available for review" }, { status: 409 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to close reminder review" }, { status: 500 });
  }
}
