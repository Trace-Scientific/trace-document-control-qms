import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticatePlatformRequest, PlatformAuthenticationRequiredError } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError, requirePlatformAuthorization } from "@/lib/platform/authorization";

type FindingRow = { findingCode: string; findingCount: bigint; affectedProposals: bigint };
async function authenticate(request: NextRequest, permission: "platform.sales.read" | "platform.sales.manage") {
  const context = await authenticatePlatformRequest(request);
  requirePlatformAuthorization(context, { permission });
  return context;
}
function failure(error: unknown) {
  if (error instanceof PlatformAuthenticationRequiredError) return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
  return NextResponse.json({ error: "Commercial audit scan history unavailable" }, { status: 503 });
}
export async function GET(request: NextRequest) {
  try {
    await authenticate(request, "platform.sales.read");
    const scans = await db.traceQmsCommercialAuditScan.findMany({
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, checkedAt: true, findingCount: true, affectedProposals: true, findingsByCode: true, trigger: true },
    });
    return NextResponse.json({ data: scans }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const context = await authenticate(request, "platform.sales.manage");
    const scan = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<FindingRow[]>(Prisma.sql`
        SELECT "findingCode", COUNT(*)::bigint AS "findingCount",
               COUNT(DISTINCT "proposalId")::bigint AS "affectedProposals"
        FROM "TraceQmsCommercialProposalAuditFinding"
        GROUP BY "findingCode" ORDER BY "findingCode"
      `);
      const findingsByCode = rows.map(row => ({
        findingCode: row.findingCode,
        findingCount: Number(row.findingCount),
        affectedProposals: Number(row.affectedProposals),
      }));
      const total = findingsByCode.reduce((sum, row) => sum + row.findingCount, 0);
      const distinct = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT "proposalId")::bigint AS count FROM "TraceQmsCommercialProposalAuditFinding"
      `);
      return tx.traceQmsCommercialAuditScan.create({
        data: {
          findingCount: total,
          affectedProposals: Number(distinct[0]?.count ?? 0),
          findingsByCode,
          initiatedByIdentityId: context.platformIdentityId,
          trigger: "MANUAL",
        },
        select: { id: true, checkedAt: true, findingCount: true, affectedProposals: true, findingsByCode: true, trigger: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return NextResponse.json({ data: scan }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
