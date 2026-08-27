import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { PrivateObjectStorage } from "@/lib/storage/s3";
const MAX_BYTES = 25 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"]);
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180) || "file";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); requireAuthorization(context, { organizationId: context.organizationId, permission: "document.read" });
    const rows = await db.fileObject.findMany({ where: { organizationId: context.organizationId }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ data: rows.map((row) => ({ ...row, sizeBytes: row.sizeBytes.toString() })) });
  } catch (error) { if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ error: "Files could not be loaded" }, { status: 403 }); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); requireAuthorization(context, { organizationId: context.organizationId, permission: "document.create" });
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_BYTES || !allowedTypes.has(file.type)) return NextResponse.json({ error: "Unsupported file or file size" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer()), hash = createHash("sha256").update(bytes).digest("hex"), id = randomUUID(), key = `${context.organizationId}/${id}/${safeName(file.name)}`;
    const row = await db.fileObject.create({ data: { id, organizationId: context.organizationId, storageKey: key, originalName: safeName(file.name), mimeType: file.type, sizeBytes: file.size, sha256: hash, status: "PENDING_SCAN", uploadedByUserId: context.userId } });
    try { await new PrivateObjectStorage().put(key, bytes, file.type); await db.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: "FILE_UPLOADED_PENDING_SCAN", entityType: "FileObject", entityId: row.id, newHash: hash, metadata: { originalName: row.originalName, sizeBytes: file.size, mimeType: file.type } } }); }
    catch { await db.fileObject.update({ where: { id: row.id }, data: { status: "QUARANTINED" } }); throw new Error("Storage failed"); }
    return NextResponse.json({ data: { id: row.id, status: row.status, sha256: row.sha256 } }, { status: 201 });
  } catch (error) { if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ error: "File upload could not be completed" }, { status: 503 }); }
}
