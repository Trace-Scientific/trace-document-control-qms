import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateRequest,
  AuthenticationRequiredError,
} from "@/lib/security/authenticated-request";
import {
  PrismaDocumentLifecycleStore,
  DocumentConfigurationError,
} from "@/lib/documents/prisma-store";
import {
  DocumentCommandError,
  DocumentCommandService,
  DocumentConcurrencyError,
} from "@/lib/documents/service";
import { DocumentLifecycleError } from "@/lib/documents/lifecycle";
import { createHash } from "node:crypto";

const uuid = z.string().uuid();
const createDraft = z.object({
  operation: z.literal("CREATE_DRAFT"),
  documentTypeId: uuid,
  documentNumber: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  versionNumber: z.number().int().positive(),
  revisionLabel: z.string().trim().min(1).max(50),
  contentText: z.string().trim().min(1).max(1_000_000),
  changeSummary: z.string().trim().min(1).max(4000),
});
const transition = z.object({
  operation: z.literal("TRANSITION"),
  versionId: uuid,
  command: z.enum(["SUBMIT", "MAKE_EFFECTIVE"]),
  expectedLockVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(4000).optional(),
  assigneeUserId: uuid.optional(),
  assigneeUserIds: z.array(uuid).min(1).max(10).optional(),
  dueAt: z.coerce.date().optional(),
  comment: z.string().trim().min(1).max(4000).optional(),
});
const updateDraft = z.object({
  operation: z.literal("UPDATE_DRAFT"),
  versionId: uuid,
  expectedLockVersion: z.number().int().nonnegative(),
  contentText: z.string().trim().min(1).max(1_000_000),
  changeSummary: z.string().trim().min(1).max(4000),
});
const createRevision = z.object({
  operation: z.literal("CREATE_REVISION"),
  sourceVersionId: uuid,
  revisionLabel: z.string().trim().min(1).max(50),
  contentText: z.string().trim().min(1).max(1_000_000),
  changeSummary: z.string().trim().min(1).max(4000),
});
const commandSchema = z.discriminatedUnion("operation", [
  createDraft,
  createRevision,
  updateDraft,
  transition,
]);
const service = new DocumentCommandService(new PrismaDocumentLifecycleStore());

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const command = commandSchema.parse(await request.json());
    const result =
      command.operation === "CREATE_DRAFT"
        ? await service.createDraft(context, {
            ...command,
            organizationId: context.organizationId,
            contentHash: createHash("sha256")
              .update(command.contentText, "utf8")
              .digest("hex"),
          })
        : command.operation === "CREATE_REVISION"
          ? await service.createRevision(context, {
              ...command,
              organizationId: context.organizationId,
              contentHash: createHash("sha256")
                .update(command.contentText, "utf8")
                .digest("hex"),
            })
          : command.operation === "UPDATE_DRAFT"
            ? await service.updateDraft(context, {
                ...command,
                organizationId: context.organizationId,
                contentHash: createHash("sha256")
                  .update(command.contentText, "utf8")
                  .digest("hex"),
              })
            : await service.transition(context, {
                ...command,
                organizationId: context.organizationId,
              });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    if (error instanceof DocumentConcurrencyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (
      error instanceof z.ZodError ||
      error instanceof DocumentLifecycleError ||
      error instanceof DocumentCommandError ||
      error instanceof DocumentConfigurationError
    ) {
      return NextResponse.json(
        { error: "The document command is invalid" },
        { status: 422 },
      );
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Unable to process the document command" },
      { status: 500 },
    );
  }
}
