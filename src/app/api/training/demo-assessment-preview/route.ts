import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaTrainingStore } from "@/lib/training/training-store";
import { DemoQuizValidationError } from "@/lib/training/demo-quiz";
import { previewAssignedDemoQuiz } from "@/lib/training/demo-assessment-preview";

const schema = z.object({
  assignmentId: z.string().uuid(),
  answers: z.array(z.number().int().nonnegative()).max(20),
}).strict();
const store = new PrismaTrainingStore();

/** Administrator-only, read-only demonstration. Never creates training evidence. */
export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = schema.parse(await request.json());
    const result = await previewAssignedDemoQuiz(context, store, {
      organizationId: context.organizationId,
      assignmentId: input.assignmentId,
      answers: input.answers,
    });
    return NextResponse.json({ data: result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError || error instanceof DemoQuizValidationError) return NextResponse.json({ error: "Invalid demo assessment" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Assessment preview failed" }, { status: 500 });
  }
}
