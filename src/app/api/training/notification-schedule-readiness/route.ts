import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

/** Report staging schedule settings and outbound delivery readiness. */
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

const scheduleSettings = z.object({
  scheduleEnabled: z.boolean(),
  hourUtc: z.number().int().min(0).max(23),
  minimumIntervalHours: z.number().int().min(24).max(168),
}).strict();

export async function PUT(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const context = await authenticateRequest(request);
    const { organizationId, userId } = context;
    requireAuthorization(context, { organizationId, permission: "training.manage" });

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return NextResponse.json({ error: "Expected JSON staging schedule settings" }, { status: 415, headers });
    }
    const parsed = scheduleSettings.safeParse(await request.json().catch(() => null));
    if (!parsed.success || request.nextUrl.searchParams.size > 0) {
      return NextResponse.json({ error: "Invalid staging schedule settings" }, { status: 422, headers });
    }

    const settings = parsed.data;
    await db.$transaction(async (tx) => {
      const changed = await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TrainingNotificationSchedule" AS schedule
          ("organizationId", "enabled", "hourUtc", "minimumIntervalHours", "updatedByUserId")
        VALUES (${organizationId}::uuid, ${settings.scheduleEnabled}, ${settings.hourUtc},
          ${settings.minimumIntervalHours}, ${userId}::uuid)
        ON CONFLICT ("organizationId") DO UPDATE SET
          "enabled" = EXCLUDED."enabled",
          "hourUtc" = EXCLUDED."hourUtc",
          "minimumIntervalHours" = EXCLUDED."minimumIntervalHours",
          "updatedByUserId" = EXCLUDED."updatedByUserId",
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE (schedule."enabled", schedule."hourUtc", schedule."minimumIntervalHours")
          IS DISTINCT FROM (EXCLUDED."enabled", EXCLUDED."hourUtc", EXCLUDED."minimumIntervalHours")
      `);
      if (changed) {
        await tx.auditEvent.create({
          data: {
            organizationId,
            actorUserId: userId,
            action: "TRAINING_NOTIFICATION_SCHEDULE_UPDATED",
            entityType: "Organization",
            entityId: organizationId,
            metadata: { ...settings, deliveryActive: false },
          },
        });
      }
    });
    return NextResponse.json({ data: settings, deliveryActive: false }, { headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers });
    }
    return NextResponse.json({ error: "Unable to save the staging schedule" }, { status: 500, headers });
  }
}
