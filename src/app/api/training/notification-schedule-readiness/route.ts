import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

/**
 * Read-only scheduling readiness report. No endpoint to activate scheduling,
 * no scheduler invocation, and no outbound provider are present.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    if (request.nextUrl.searchParams.size) {
      return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    }
    const rows = await db.$queryRaw<Array<{
      scheduleEnabled: boolean; hourUtc: number; minimumIntervalHours: number;
      lastRunAt: Date | null; preferencesEnabled: boolean;
      pending: bigint; failed: bigint; reviewRequired: bigint;
    }>>(Prisma.sql`
      SELECT COALESCE(s."enabled", FALSE) AS "scheduleEnabled",
        COALESCE(s."hourUtc", 14) AS "hourUtc",
        COALESCE(s."minimumIntervalHours", 24) AS "minimumIntervalHours",
        s."lastRunAt",
        COALESCE(p."enabled", FALSE) AS "preferencesEnabled",
        (SELECT COUNT(*) FROM "TrainingRenewalNotificationDelivery" d
          WHERE d."organizationId" = ${context.organizationId}::uuid AND d."status" = 'PENDING') AS "pending",
        (SELECT COUNT(*) FROM "TrainingRenewalNotificationDelivery" d
          WHERE d."organizationId" = ${context.organizationId}::uuid AND d."status" = 'FAILED') AS "failed",
        (SELECT COUNT(*) FROM "TrainingRenewalNotificationDelivery" d
          WHERE d."organizationId" = ${context.organizationId}::uuid AND d."status" = 'REVIEW_REQUIRED') AS "reviewRequired"
      FROM (SELECT 1) seed
      LEFT JOIN "TrainingNotificationSchedule" s ON s."organizationId" = ${context.organizationId}::uuid
      LEFT JOIN "TrainingNotificationPreference" p ON p."organizationId" = ${context.organizationId}::uuid
    `);
    const row = rows[0];
    return NextResponse.json({
      data: {
        scheduleEnabled: row.scheduleEnabled,
        hourUtc: row.hourUtc,
        minimumIntervalHours: row.minimumIntervalHours,
        lastRunAt: row.lastRunAt,
        preferencesEnabled: row.preferencesEnabled,
        pending: Number(row.pending),
        failed: Number(row.failed),
        reviewRequired: Number(row.reviewRequired),
        readyForActivation: false,
        blockers: [
          ...(!row.scheduleEnabled ? ["Schedule not authorized for this tenant"] : []),
          ...(!row.preferencesEnabled ? ["Reminder preferences disabled"] : []),
          ...(Number(row.reviewRequired) > 0 ? ["Uncertain deliveries require manual reconciliation"] : []),
          "No outbound provider configured or verified",
          "No scheduled worker connected",
        ],
      },
      mode: "read-only",
      deliveryActive: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to assess notification schedule readiness" }, { status: 500 });
  }
}
