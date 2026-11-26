import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { evaluateAuthorization, requireAuthorization } from "@/lib/security/authorization";
import { CompetencyEligibilityError, CompetencyValidationError } from "@/lib/training/competency";
import { closeCompetencyRemediation, openCompetencyRemediation, readCompetencyRemediation } from "@/lib/training/competency-remediation";

type RouteContext = { params: Promise<{ assessmentId: string }> };
const assessmentIdSchema = z.string().uuid();
const bodySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("OPEN"), plan: z.string().trim().min(1).max(2000), dueOn: z.iso.date().nullable() }),
  z.object({ operation: z.literal("CLOSE"), followUpAssessmentId: z.string().uuid(), resolution: z.string().trim().min(1).max(2000) }),
]);

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId } = context;
    requireAuthorization(context, { organizationId, permission: "training.read" });
    const assessmentId = assessmentIdSchema.parse((await params).assessmentId);
    const canManage = evaluateAuthorization(context, { organizationId, permission: "training.manage" }).allowed;
    const view = await readCompetencyRemediation({ organizationId, assessmentId }, canManage);
    return view ? NextResponse.json({ data: view }) : NextResponse.json({ error: "Assessment not found." }, { status: 404 });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId, userId: actorUserId } = context;
    requireAuthorization(context, { organizationId, permission: "training.manage" });
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Send remediation changes as JSON." }, { status: 415 });
    }
    const assessmentId = assessmentIdSchema.parse((await params).assessmentId);
    const input = bodySchema.parse(await request.json());
    const scope = { organizationId, assessmentId, actorUserId };
    if (input.operation === "OPEN") {
      return NextResponse.json({ data: await openCompetencyRemediation({ ...scope, plan: input.plan, dueOn: input.dueOn }) }, { status: 201 });
    }
    return NextResponse.json({ data: await closeCompetencyRemediation({
      ...scope, followUpAssessmentId: input.followUpAssessmentId, resolution: input.resolution,
    }) });
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid remediation request." }, { status: 422 });
  if (error instanceof CompetencyEligibilityError || error instanceof CompetencyValidationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Unable to save or load competency remediation." }, { status: 500 });
}
