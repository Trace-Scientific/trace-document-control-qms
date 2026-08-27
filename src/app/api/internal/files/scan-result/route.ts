import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
const schema = z.object({ fileId: z.string().uuid(), organizationId: z.string().uuid(), result: z.enum(["CLEAN", "MALICIOUS"]) });
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.FILE_SCAN_SECRET)) return new NextResponse(null, { status: 404 });
  try {
    const input = schema.parse(await request.json()), status = input.result === "CLEAN" ? "AVAILABLE" : "QUARANTINED";
    const row = await db.fileObject.findFirst({ where: { id: input.fileId, organizationId: input.organizationId, status: "PENDING_SCAN" } });
    if (!row) return NextResponse.json({ error: "Pending file not found" }, { status: 404 });
    await db.$transaction([db.fileObject.update({ where: { id: row.id }, data: { status } }), db.auditEvent.create({ data: { organizationId: row.organizationId, action: "FILE_SCAN_COMPLETED", entityType: "FileObject", entityId: row.id, newHash: row.sha256, metadata: { result: input.result } } })]);
    return NextResponse.json({ data: { id: row.id, status } });
  } catch { return NextResponse.json({ error: "Invalid scan result" }, { status: 400 }); }
}
