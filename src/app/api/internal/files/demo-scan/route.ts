import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { PrivateObjectStorage } from "@/lib/storage/s3";

const schema = z.object({
  fileId: z.string().uuid(),
  organizationId: z.string().uuid(),
  result: z.enum(["CLEAN", "MALICIOUS"]),
});
const demoOrganization = { loginCode: "trace-demo-lab", active: true };
const maxBytes = 25 * 1024 * 1024;
const noStore = { "Cache-Control": "no-store" };

function demoDeployment() {
  return process.env.DEPLOYMENT_TIER === "demo" && process.env.RAILWAY_ENVIRONMENT_NAME === "demo";
}

function authorized(request: NextRequest) {
  const secret = process.env.DEMO_FILE_SCAN_SECRET;
  return Boolean(secret && isAuthorizedCronRequest(request.headers.get("authorization"), secret));
}

export async function GET(request: NextRequest) {
  if (!demoDeployment() || !authorized(request)) return new NextResponse(null, { status: 404 });

  const fileId = request.nextUrl.searchParams.get("fileId");
  const after = request.nextUrl.searchParams.get("after");
  if ((fileId !== null && !schema.shape.fileId.safeParse(fileId).success) ||
      (after !== null && !schema.shape.fileId.safeParse(after).success)) {
    return new NextResponse(null, { status: 400 });
  }

  const where = { status: "PENDING_SCAN" as const, organization: demoOrganization };
  if (!fileId) {
    const files = await db.fileObject.findMany({
      where: { ...where, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      select: { id: true, organizationId: true },
      take: 20,
    });
    return NextResponse.json({ data: files }, { headers: noStore });
  }

  const file = await db.fileObject.findFirst({
    where: { ...where, id: fileId },
    select: { storageKey: true, organizationId: true, sizeBytes: true, sha256: true },
  });
  if (!file) return new NextResponse(null, { status: 404 });
  if (!file.storageKey.startsWith(`${file.organizationId}/${fileId}/`) ||
      file.sizeBytes < 1 || file.sizeBytes > maxBytes) return new NextResponse(null, { status: 409 });

  try {
    const bytes = await new PrivateObjectStorage().get(file.storageKey);
    if (BigInt(bytes.length) !== file.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      return new NextResponse(null, { status: 409 });
    }
    return new NextResponse(new Uint8Array(bytes).buffer, {
      headers: { ...noStore, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!demoDeployment() || !authorized(request)) return new NextResponse(null, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid scan result" }, { status: 400 });
  const input = parsed.data;
  const status = input.result === "CLEAN" ? "AVAILABLE" : "QUARANTINED";
  const where = {
    id: input.fileId,
    organizationId: input.organizationId,
    status: "PENDING_SCAN" as const,
    organization: demoOrganization,
  };

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.fileObject.findFirst({ where, select: { id: true, organizationId: true, sha256: true } });
    if (!row) return false;
    const change = await tx.fileObject.updateMany({ where: { ...where, sha256: row.sha256 }, data: { status } });
    if (change.count !== 1) return false;
    await tx.auditEvent.create({
      data: { organizationId: row.organizationId, action: "FILE_SCAN_COMPLETED", entityType: "FileObject",
        entityId: row.id, newHash: row.sha256, metadata: { result: input.result } },
    });
    return true;
  });
  if (!updated) return NextResponse.json({ error: "Pending file not found" }, { status: 404 });
  return NextResponse.json({ data: { id: input.fileId, status } });
}
