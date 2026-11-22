import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

/**
 * Dry-run candidate processor. No inserts, updates, outbound messages or cron.
 * Uses the same deduplication identity as TrainingRenewalNotificationDelivery.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    if (request.nextUrl.searchParams.size) {
      return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    }
    const rows = await db.$queryRaw<Array<{
      reminderType: string; eligible: bigint; alreadyRecorded: bigint;
    }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (r."employeeId", r."courseId")
          r."id" AS "completionId", r."employeeId", r."courseId", r."completedAt"
        FROM "TrainingRecord" r
        WHERE r."organizationId" = ${context.organizationId}::uuid
        ORDER BY r."employeeId", r."courseId", r."completedAt" DESC, r."createdAt" DESC, r."id" DESC
      ), candidate AS (
        SELECT l."employeeId", l."courseId",
          (l."completedAt" + make_interval(months => p."intervalMonths"))::date AS "dueDate",
          CASE
            WHEN (l."completedAt" + make_interval(months => p."intervalMonths"))::date < CURRENT_DATE
              AND p2."remindOverdue" THEN 'OVERDUE'
            WHEN (l."completedAt" + make_interval(months => p."intervalMonths"))::date
              BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND p2."remind7Days" THEN 'DUE_7'
            WHEN (l."completedAt" + make_interval(months => p."intervalMonths"))::date
              BETWEEN CURRENT_DATE + 8 AND CURRENT_DATE + 30 AND p2."remind30Days" THEN 'DUE_30'
            ELSE NULL
          END AS "reminderType"
        FROM latest l
        JOIN "TrainingCourseRenewalPolicy" p
          ON p."organizationId" = ${context.organizationId}::uuid AND p."courseId" = l."courseId"
        JOIN "Employee" e
          ON e."organizationId" = ${context.organizationId}::uuid AND e."id" = l."employeeId"
        JOIN "TrainingNotificationPreference" p2
          ON p2."organizationId" = ${context.organizationId}::uuid AND p2."enabled" = TRUE
        WHERE e."status"::text = 'ACTIVE'
      )
      SELECT c."reminderType", count(*) FILTER (WHERE d."id" IS NULL) AS eligible,
        count(*) FILTER (WHERE d."id" IS NOT NULL) AS "alreadyRecorded"
      FROM candidate c
      LEFT JOIN "TrainingRenewalNotificationDelivery" d
        ON d."organizationId" = ${context.organizationId}::uuid
        AND d."employeeId" = c."employeeId" AND d."courseId" = c."courseId"
        AND d."renewalDueDate" = c."dueDate" AND d."reminderType" = c."reminderType"
      WHERE c."reminderType" IS NOT NULL
      GROUP BY c."reminderType"
      ORDER BY c."reminderType"
    `);
    return NextResponse.json({
      data: rows.map((row) => ({
        reminderType: row.reminderType,
        eligible: Number(row.eligible),
        alreadyRecorded: Number(row.alreadyRecorded),
      })),
      mode: "dry-run",
      deliveryActive: false,
      recordsCreated: 0,
      messagesSent: 0,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to preview notification processing" }, { status: 500 });
  }
}
