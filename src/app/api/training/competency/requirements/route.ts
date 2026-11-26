import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { evaluateAuthorization, requireAuthorization } from "@/lib/security/authorization";
import { CompetencyEligibilityError, CompetencyValidationError } from "@/lib/training/competency";
import { competencyRequirementScopes } from "@/lib/training/competency-requirements";
import {
  createCompetencyRequirement,
  listCompetencyRequirements,
  retireCompetencyRequirement,
} from "@/lib/training/competency-requirements-store";

const requestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("CREATE"),
    programId: z.string().uuid(),
    scope: z.enum(competencyRequirementScopes),
    targetId: z.string().uuid(),
  }),
  z.object({
    operation: z.literal("RETIRE"),
    requirementId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId } = context;
    requireAuthorization(context, { organizationId, permission: "training.read" });
    requireAuthorization(context, { organizationId, permission: "personnel.read" });
    const canManage = evaluateAuthorization(context, { organizationId, permission: "training.manage" }).allowed;
    const canReadEquipment = evaluateAuthorization(context, { organizationId, permission: "equipment.read" }).allowed;
    return NextResponse.json({ data: await listCompetencyRequirements(organizationId, canManage, canReadEquipment) });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId, userId: actorUserId } = context;
    requireAuthorization(context, { organizationId, permission: "training.manage" });
    requireAuthorization(context, { organizationId, permission: "personnel.read" });
    const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      return NextResponse.json({ error: "Send the competency requirement as JSON." }, { status: 415 });
    }
    const input = requestSchema.parse(await request.json());
    if (input.operation === "RETIRE") {
      return NextResponse.json({ data: await retireCompetencyRequirement({ ...input, organizationId, actorUserId }) });
    }
    return NextResponse.json({ data: await createCompetencyRequirement({ ...input, organizationId, actorUserId }) }, { status: 201 });
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid competency requirement request." }, { status: 422 });
  }
  if (error instanceof CompetencyValidationError || error instanceof CompetencyEligibilityError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message === "Access denied") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  return NextResponse.json({ error: "Competency requirements are unavailable. Retry the operation." }, { status: 500 });
}
