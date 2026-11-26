import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { CompetencyEligibilityError, CompetencyValidationError } from "@/lib/training/competency";
import { PrismaCompetencyStore } from "@/lib/training/competency-store";

const store = new PrismaCompetencyStore();
const id = z.string().uuid();
const write = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("AUTHORIZE"), programId: id, employeeId: id, fileId: id,
    basis: z.string().trim().min(1).max(1000),
  }),
  z.object({
    operation: z.literal("REVOKE"), programId: id, authorizationId: id, reason: z.string().trim().min(1).max(1000),
  }),
]);

async function authorize(request: NextRequest) {
  const context = await authenticateRequest(request);
  requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
  requireAuthorization(context, { organizationId: context.organizationId, permission: "personnel.manage" });
  return { organizationId: context.organizationId, actorUserId: context.userId };
}

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = await authorize(request);
    const programId = id.parse(request.nextUrl.searchParams.get("programId"));
    return NextResponse.json({ data: await store.listEvaluatorAuthorizations(organizationId, programId) });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authorize(request);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Send evaluator changes as JSON." }, { status: 415 });
    }
    const input = write.parse(await request.json());
    if (input.operation === "REVOKE") {
      return NextResponse.json({ data: await store.revokeEvaluator({ ...input, ...context }) });
    }
    return NextResponse.json({ data: await store.authorizeEvaluator({ ...input, ...context }) }, { status: 201 });
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid evaluator authorization request." }, { status: 422 });
  if (error instanceof CompetencyValidationError || error instanceof CompetencyEligibilityError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Unable to manage competency evaluators." }, { status: 500 });
}
