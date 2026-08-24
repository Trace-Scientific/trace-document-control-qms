import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaDocumentLifecycleStore, DocumentConfigurationError } from "@/lib/documents/prisma-store";
import { DocumentCommandService, DocumentConcurrencyError } from "@/lib/documents/service";
import { DocumentLifecycleError } from "@/lib/documents/lifecycle";

const uuid = z.string().uuid();
const createDraft = z.object({
  operation: z.literal("CREATE_DRAFT"),
  organizationId: uuid,
  documentTypeId: uuid,
  documentNumber: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  versionNumber: z.number().int().positive(),
  revisionLabel: z.string().trim().min(1).max(50),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  changeSummary: z.string().trim().min(1).max(4000),
});
const transition = z.object({
  operation: z.literal("TRANSITION"),
  organizationId: uuid,
  versionId: uuid,
  command: z.enum(["SUBMIT", "REJECT", "MAKE_EFFECTIVE"]),
  expectedLockVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(4000).optional(),
});
const commandSchema = z.discriminatedUnion("operation", [createDraft, transition]);
const service = new DocumentCommandService(new PrismaDocumentLifecycleStore());

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const command = commandSchema.parse(await request.json());
    const result = command.operation === "CREATE_DRAFT"
      ? await service.createDraft(context, command)
      : await service.transition(context, command);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof DocumentConcurrencyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof DocumentLifecycleError ||
      error instanceof DocumentConfigurationError
    ) {
      return NextResponse.json({ error: "The document command is invalid" }, { status: 422 });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to process the document command" }, { status: 500 });
  }
}
