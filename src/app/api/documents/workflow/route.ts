import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateRequest,
  AuthenticationRequiredError,
} from "@/lib/security/authenticated-request";
import { PrismaWorkflowReviewStore } from "@/lib/documents/workflow-review-store";
import {
  WorkflowReviewConflictError,
  WorkflowReviewService,
  WorkflowReviewValidationError,
} from "@/lib/documents/workflow-review";
const service = new WorkflowReviewService(new PrismaWorkflowReviewStore()),
  schema = z.discriminatedUnion("operation", [
    z.object({
      operation: z.literal("DECIDE"),
      taskId: z.string().uuid(),
      decision: z.enum(["ACCEPT", "REQUEST_CHANGES"]),
      comment: z.string().trim().min(1).max(4000),
    }),
    z.object({ operation: z.literal("MONITOR_OVERDUE") }),
    z.object({
      operation: z.enum(["REASSIGN", "DELEGATE"]),
      taskId: z.string().uuid(),
      newAssigneeUserId: z.string().uuid(),
      reason: z.string().trim().min(1).max(4000),
    }),
  ]);
export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request),
      input = schema.parse(await request.json()),
      data = input.operation === "DECIDE"
          ? await service.decide(context, {
              ...input,
              organizationId: context.organizationId,
            })
          : input.operation === "MONITOR_OVERDUE"
            ? await service.notifyOverdue(context, context.organizationId)
            : await service.transfer(context, {
                ...input,
                mode: input.operation,
                organizationId: context.organizationId,
              });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    if (error instanceof WorkflowReviewConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (
      error instanceof z.ZodError ||
      error instanceof WorkflowReviewValidationError
    )
      return NextResponse.json(
        { error: "The workflow review request is invalid" },
        { status: 422 },
      );
    if (error instanceof Error && error.message === "Access denied")
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json(
      { error: "Unable to process workflow review" },
      { status: 500 },
    );
  }
}
