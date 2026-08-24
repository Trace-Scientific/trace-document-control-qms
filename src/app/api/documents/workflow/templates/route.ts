import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaWorkflowTemplateStore } from "@/lib/documents/workflow-template-store";
import {
  WorkflowTemplateConflictError,
  WorkflowTemplateService,
  WorkflowTemplateValidationError,
} from "@/lib/documents/workflow-template";

const service = new WorkflowTemplateService(new PrismaWorkflowTemplateStore());
const schema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("CREATE_VERSION"),
    key: z.string().trim().min(2).max(50),
    name: z.string().trim().min(1).max(100),
    stages: z.array(z.object({ name: z.string().trim().min(1).max(100), dueDays: z.number().int().min(1).max(365) })).min(1).max(10),
  }),
  z.object({
    operation: z.literal("SET_ACTIVE"),
    templateId: z.string().uuid(),
    active: z.boolean(),
    reason: z.string().trim().min(1).max(4000),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    return NextResponse.json({ data: await service.list(context, context.organizationId) });
  } catch (error) { return response(error); }
}
export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = schema.parse(await request.json());
    const data = input.operation === "CREATE_VERSION"
      ? await service.createVersion(context, { ...input, organizationId: context.organizationId })
      : await service.setActive(context, { ...input, organizationId: context.organizationId });
    return NextResponse.json({ data });
  } catch (error) { return response(error); }
}
function response(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof WorkflowTemplateConflictError) return NextResponse.json({ error: "The workflow template state changed" }, { status: 409 });
  if (error instanceof z.ZodError || error instanceof WorkflowTemplateValidationError) return NextResponse.json({ error: "The workflow template request is invalid" }, { status: 422 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Unable to process workflow template" }, { status: 500 });
}
