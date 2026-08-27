import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { PrivateObjectStorage } from "@/lib/storage/s3";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateRequest(request), id = z.string().uuid().parse((await params).id); requireAuthorization(context, { organizationId: context.organizationId, permission: "document.read" });
    const row = await db.fileObject.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row || row.status !== "AVAILABLE") return NextResponse.json({ error: "File is unavailable" }, { status: 404 });
    const bytes = await new PrivateObjectStorage().get(row.storageKey), hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== row.sha256) return NextResponse.json({ error: "File integrity check failed" }, { status: 409 });
    await db.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: "FILE_DOWNLOADED", entityType: "FileObject", entityId: row.id, newHash: hash } });
    return new NextResponse(Buffer.from(bytes), { headers: { "content-type": row.mimeType, "content-disposition": `attachment; filename="${row.originalName.replace(/["\\]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) { if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ error: "File could not be downloaded" }, { status: 403 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateRequest(request), id = z.string().uuid().parse((await params).id); requireAuthorization(context, { organizationId: context.organizationId, permission: "document.delete" });
    const row = await db.fileObject.findFirst({ where: { id, organizationId: context.organizationId }, include: { documentVersions: { select: { id: true }, take: 1 } } });
    if (!row || row.documentVersions.length) return NextResponse.json({ error: "Controlled files cannot be removed" }, { status: 409 });
    await db.$transaction([db.fileObject.update({ where: { id: row.id }, data: { status: "ARCHIVED" } }), db.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: "FILE_ARCHIVED", entityType: "FileObject", entityId: row.id, previousHash: row.sha256, reason: "Retention-safe logical removal" } })]);
    return NextResponse.json({ data: { id: row.id, status: "ARCHIVED" } });
  } catch (error) { if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ error: "File could not be archived" }, { status: 403 }); }
}
