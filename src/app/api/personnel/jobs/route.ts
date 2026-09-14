import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaPersonnelStore } from "@/lib/personnel/personnel-store";
import { PersonnelService, PersonnelValidationError } from "@/lib/personnel/personnel";

const service = new PersonnelService(new PrismaPersonnelStore());
const createSchema = z.object({
  code: z.string().max(40),
  title: z.string().max(200),
  summary: z.string().max(2000).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    return NextResponse.json({ data: await service.listJobDescriptions(context, context.organizationId) });
  } catch (error) {
    return respond(error, "list job descriptions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.createJobDescription(context, {
      organizationId: context.organizationId,
      code: input.code,
      title: input.title,
      summary: input.summary ?? null,
    }) }, { status: 201 });
  } catch (error) {
    return respond(error, "create job description");
  }
}

function respond(error: unknown, operation: string) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid job description request" }, { status: 422 });
  if (error instanceof PersonnelValidationError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  console.error(`[personnel] Unexpected failure during ${operation}`, error);
  return NextResponse.json({ error: "Job description operation failed" }, { status: 500 });
}
