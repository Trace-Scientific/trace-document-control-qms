import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaPersonnelStore } from "@/lib/personnel/personnel-store";
import { PersonnelEligibilityError, PersonnelService, PersonnelValidationError } from "@/lib/personnel/personnel";

const service = new PersonnelService(new PrismaPersonnelStore());
const createSchema = z.object({
  employeeId: z.string().uuid(),
  jobDescriptionId: z.string().uuid(),
  siteId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  isPrimary: z.boolean().optional(),
  assignedAt: z.string().date(),
});
const endSchema = z.object({
  operation: z.literal("END"),
  assignmentId: z.string().uuid(),
  endedAt: z.string().date(),
  reason: z.string().max(1000),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const employeeId = request.nextUrl.searchParams.get("employeeId") ?? undefined;
    if (employeeId) z.string().uuid().parse(employeeId);
    return NextResponse.json({ data: await service.listAssignments(context, context.organizationId, employeeId) });
  } catch (error) {
    return respond(error, "list assignments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const body = await request.json();
    if (body?.operation === "END") {
      const input = endSchema.parse(body);
      return NextResponse.json({ data: await service.endAssignment(context, {
        organizationId: context.organizationId,
        assignmentId: input.assignmentId,
        endedAt: new Date(`${input.endedAt}T00:00:00.000Z`),
        reason: input.reason,
      }) });
    }
    const input = createSchema.parse(body);
    return NextResponse.json({ data: await service.createAssignment(context, {
      organizationId: context.organizationId,
      employeeId: input.employeeId,
      jobDescriptionId: input.jobDescriptionId,
      siteId: input.siteId ?? null,
      departmentId: input.departmentId ?? null,
      isPrimary: input.isPrimary ?? false,
      assignedAt: new Date(`${input.assignedAt}T00:00:00.000Z`),
    }) }, { status: 201 });
  } catch (error) {
    return respond(error, "mutate assignment");
  }
}

function respond(error: unknown, operation: string) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid personnel assignment request" }, { status: 422 });
  if (error instanceof PersonnelValidationError || error instanceof PersonnelEligibilityError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  console.error(`[personnel] Unexpected failure during ${operation}`, error);
  return NextResponse.json({ error: "Personnel assignment operation failed" }, { status: 500 });
}
