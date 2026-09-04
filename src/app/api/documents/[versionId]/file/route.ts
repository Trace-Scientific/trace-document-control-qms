import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { DocumentFileAttachmentConcurrencyError, DocumentFileAttachmentError, DocumentFileAttachmentService } from "@/lib/documents/file-attachment";
import { PrismaDocumentFileAttachmentStore } from "@/lib/documents/file-attachment-store";

const service = new DocumentFileAttachmentService(new PrismaDocumentFileAttachmentStore());
const inputSchema = z.object({ fileId: z.string().uuid(), expectedLockVersion: z.number().int().nonnegative() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const { versionId } = await params;
    const input = inputSchema.parse(await request.json());
    const data = await service.attach(context, {
      organizationId: context.organizationId,
      versionId: z.string().uuid().parse(versionId),
      ...input,
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof DocumentFileAttachmentConcurrencyError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof DocumentFileAttachmentError || error instanceof z.ZodError)
      return NextResponse.json({ error: error instanceof DocumentFileAttachmentError ? error.message : "Invalid attachment request" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied")
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Controlled file could not be attached" }, { status: 500 });
  }
}
