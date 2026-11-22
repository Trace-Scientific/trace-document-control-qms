import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

/** Read-only digest preview. No notifications are sent or stored. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    if (request.nextUrl.searchParams.size) {
      return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    }
    const counts = await db.$queryRaw<Array<{ overdue: bigint; within7Days: bigint; within30Days: bigint }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (r."employeeId", r."courseId")
          r."employeeId", r."courseId", r."completedAt"
        FROM "TrainingRecord" r
        WHERE r."organizationId" = ${context.organizationId}::uuid
        ORDER BY r."employeeId", r."courseId", r."completedAt" DESC, r."createdAt" DESC, r."id" DESC
      ), renewals AS (
        SELECT (l."completedAt" + make_interval(months => p."intervalMonths"))::date AS due
        FROM latest l
        JOIN "TrainingCourseRenewalPolicy" p
          ON p."organizationId" = ${context.organizationId}::uuid AND p."courseId" = l."courseId"
        JOIN "Employee" e
          ON e."organizationId" = ${context.organizationId}::uuid AND e."id" = l."employeeId"
        WHERE e."status"::text = 'ACTIVE'
      )
      SELECT
        count(*) FILTER (WHERE due < CURRENT_DATE) AS overdue,
        count(*) FILTER (WHERE due BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS "within7Days",
        count(*) FILTER (WHERE due BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS "within30Days"
      FROM renewals
    `);
    const result = counts[0];
    return NextResponse.json({
      data: {
        overdue: Number(result?.overdue ?? 0),
        within7Days: Number(result?.within7Days ?? 0),
        within30Days: Number(result?.within30Days ?? 0),
        deliveryEnabled: false,
        mode: "preview",
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to preview renewal notifications" }, { status: 500 });
  }
}
