import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

/** Manager-visible forecast only: completed records remain immutable and no assignments are generated. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.read" });
    if (request.nextUrl.searchParams.size !== 0) {
      return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    }
    const rows = await db.$queryRaw<Array<{
      employeeId: string; employeeNumber: string; firstName: string; lastName: string;
      courseId: string; courseCode: string; courseTitle: string;
      completionId: string; completedAt: Date; intervalMonths: number; renewalDueAt: Date;
      daysUntilDue: number;
    }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (r."employeeId", r."courseId")
          r."id", r."employeeId", r."courseId", r."completedAt"
        FROM "TrainingRecord" r
        WHERE r."organizationId" = ${context.organizationId}::uuid
        ORDER BY r."employeeId", r."courseId", r."completedAt" DESC, r."createdAt" DESC, r."id" DESC
      )
      SELECT e."id" AS "employeeId", e."employeeNumber", e."firstName", e."lastName",
        c."id" AS "courseId", c."code" AS "courseCode", c."title" AS "courseTitle",
        l."id" AS "completionId", l."completedAt", p."intervalMonths",
        (l."completedAt" + make_interval(months => p."intervalMonths")) AS "renewalDueAt",
        ((l."completedAt" + make_interval(months => p."intervalMonths"))::date - CURRENT_DATE)::integer AS "daysUntilDue"
      FROM latest l
      JOIN "TrainingCourseRenewalPolicy" p
        ON p."organizationId" = ${context.organizationId}::uuid AND p."courseId" = l."courseId"
      JOIN "Employee" e
        ON e."organizationId" = ${context.organizationId}::uuid AND e."id" = l."employeeId"
      JOIN "TrainingCourse" c
        ON c."organizationId" = ${context.organizationId}::uuid AND c."id" = l."courseId"
      WHERE e."status"::text = 'ACTIVE'
      ORDER BY "renewalDueAt" ASC, e."lastName", e."firstName"
      LIMIT 1000
    `);
    return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load renewal forecast" }, { status: 500 });
  }
}
