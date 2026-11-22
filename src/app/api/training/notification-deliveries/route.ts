import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

/** Read-only ledger status for tenant training managers. No delivery occurs here. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    if (request.nextUrl.searchParams.size) {
      return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    }
    const rows = await db.$queryRaw<Array<{
      status: string; reminderType: string; total: bigint;
    }>>(Prisma.sql`
      SELECT "status", "reminderType", COUNT(*) AS total
      FROM "TrainingRenewalNotificationDelivery"
      WHERE "organizationId" = ${context.organizationId}::uuid
      GROUP BY "status", "reminderType"
      ORDER BY "status", "reminderType"
    `);
    return NextResponse.json({
      data: rows.map((row) => ({ status: row.status, reminderType: row.reminderType, count: Number(row.total) })),
      deliveryActive: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load notification ledger" }, { status: 500 });
  }
}
