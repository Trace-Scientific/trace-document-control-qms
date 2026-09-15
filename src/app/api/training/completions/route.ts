import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaTrainingStore } from "@/lib/training/training-store";
import { TrainingEligibilityError, TrainingService, TrainingValidationError } from "@/lib/training/training";

const service = new TrainingService(new PrismaTrainingStore());
const createSchema = z.object({ assignmentId: z.string().uuid(), completedAt: z.string().datetime(), result: z.string().max(500).nullish(), fileId: z.string().uuid().nullish() });

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const employeeId = request.nextUrl.searchParams.get("employeeId") || undefined;
    if (employeeId && !z.string().uuid().safeParse(employeeId).success) return NextResponse.json({ error: "Invalid employee filter" }, { status: 422 });
    return NextResponse.json({ data: await service.listCompletions(context, context.organizationId, employeeId) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return respond(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.completeAssignment(context, {
      organizationId: context.organizationId,
      assignmentId: input.assignmentId,
      completedAt: new Date(input.completedAt),
      result: input.result ?? null,
      fileId: input.fileId ?? null,
    }) }, { status: 201 });
  } catch (error) { return respond(error); }
}

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid training completion request" }, { status: 422 });
  if (error instanceof TrainingValidationError || error instanceof TrainingEligibilityError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Training completion operation failed" }, { status: 500 });
}
