import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaPersonnelStore } from "@/lib/personnel/personnel-store";
import { PersonnelEligibilityError, PersonnelService, PersonnelValidationError } from "@/lib/personnel/personnel";

const service = new PersonnelService(new PrismaPersonnelStore());
const createSchema = z.object({
  employeeNumber: z.string().max(80),
  firstName: z.string().max(120),
  lastName: z.string().max(120),
  userId: z.string().uuid().nullish(),
  hireDate: z.string().date().nullish(),
});
const transitionSchema = z.object({
  operation: z.literal("SET_STATUS"),
  employeeId: z.string().uuid(),
  targetStatus: z.enum(["ACTIVE", "INACTIVE", "TERMINATED"]),
  effectiveDate: z.string().date().nullish(),
  reason: z.string().max(1000),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    return NextResponse.json({ data: await service.listEmployees(context, context.organizationId) });
  } catch (error) {
    return respond(error, "list employees");
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const body = await request.json();
    if (body?.operation === "SET_STATUS") {
      const input = transitionSchema.parse(body);
      return NextResponse.json({ data: await service.transitionEmployee(context, {
        organizationId: context.organizationId,
        employeeId: input.employeeId,
        targetStatus: input.targetStatus,
        effectiveDate: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00.000Z`) : null,
        reason: input.reason,
      }) });
    }
    const input = createSchema.parse(body);
    return NextResponse.json({ data: await service.createEmployee(context, {
      organizationId: context.organizationId,
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      userId: input.userId ?? null,
      hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00.000Z`) : null,
    }) }, { status: 201 });
  } catch (error) {
    return respond(error, "mutate employee");
  }
}

function respond(error: unknown, operation: string) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid personnel request" }, { status: 422 });
  if (error instanceof PersonnelValidationError || error instanceof PersonnelEligibilityError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  console.error(`[personnel] Unexpected failure during ${operation}`, error);
  return NextResponse.json({ error: "Personnel operation failed" }, { status: 500 });
}
