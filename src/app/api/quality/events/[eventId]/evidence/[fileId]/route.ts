import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { findQualityEvidenceFile } from "@/lib/quality/evidence-download";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { evaluateAuthorization, requireAuthorization } from "@/lib/security/authorization";
import { PrivateObjectStorage } from "@/lib/storage/s3";

const paramsSchema = z.object({ eventId: z.uuid(), fileId: z.uuid() });
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string; fileId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId, userId } = context;
    requireAuthorization(context, { organizationId, permission: "quality_event.read" });

    const { eventId, fileId } = paramsSchema.parse(await params);
    const canReadDocuments = evaluateAuthorization(context, { organizationId, permission: "document.read" }).allowed;
    const file = await findQualityEvidenceFile(organizationId, eventId, fileId, canReadDocuments);
    if (!file) return fail("Supporting file is unavailable for this event or account.", 404);

    const bytes = await new PrivateObjectStorage().get(file.storageKey);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== file.sha256) return fail("Supporting file failed its integrity check.", 409);

    await db.auditEvent.create({ data: {
      organizationId, actorUserId: userId, action: "FILE_DOWNLOADED", entityType: "FileObject",
      entityId: file.id, newHash: hash, metadata: { evidenceDomain: "QUALITY", qualityEventId: eventId },
    } });
    const filename = file.originalName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180) || "quality-evidence";
    return new NextResponse(Buffer.from(bytes), { headers: {
      ...headers,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return fail("Authentication required.", 401);
    if (error instanceof Error && error.message === "Access denied") return fail("Access denied.", 403);
    if (error instanceof z.ZodError) return fail("Invalid supporting file request.", 422);
    return fail("Supporting file could not be downloaded.", 500);
  }
}
