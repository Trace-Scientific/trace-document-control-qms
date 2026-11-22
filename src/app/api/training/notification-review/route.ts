import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
