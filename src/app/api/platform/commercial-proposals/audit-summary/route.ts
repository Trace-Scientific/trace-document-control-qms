import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticatePlatformRequest, PlatformAuthenticationRequiredError } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError, requirePlatformAuthorization } from "@/lib/platform/authorization";

/** On-demand read-only monitoring snapshot; not a scheduler or notification delivery mechanism. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    requirePlatformAuthorization(context, { permission: "platform.sales.read" });
    const rows = await db.$queryRaw<Array<{ findingCode: string; findingCount: bigint; affectedProposals: bigint }>>(Prisma.sql`
      SELECT "findingCode", COUNT(*)::bigint AS "findingCount",
             COUNT(DISTINCT "proposalId")::bigint AS "affectedProposals"
      FROM "TraceQmsCommercialProposalAuditFinding"
      GROUP BY "findingCode"
      ORDER BY "findingCode"
    `);
    const counts = rows.map((row) => ({
      findingCode: row.findingCode,
      findingCount: Number(row.findingCount),
      affectedProposals: Number(row.affectedProposals),
    }));
    return NextResponse.json({
      data: {
        checkedAt: new Date().toISOString(),
        totalFindings: counts.reduce((sum, row) => sum + row.findingCount, 0),
        findingsByCode: counts,
        monitoringMode: "ON_DEMAND",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlatformAuthenticationRequiredError) return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
    if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to retrieve commercial audit summary" }, { status: 503 });
  }
}
