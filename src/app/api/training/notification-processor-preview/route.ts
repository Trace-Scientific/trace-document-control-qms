import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { previewTrainingReminderQueue } from "@/lib/training/notification-queue";

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
    const rows = await previewTrainingReminderQueue(db, context.organizationId);
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
