import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { cliaCompetencyMethods } from "@/lib/training/clia-competency-methods";
import { CompetencyEligibilityError, CompetencyService, CompetencyValidationError } from "@/lib/training/competency";
import { PrismaCompetencyStore } from "@/lib/training/competency-store";

const service = new CompetencyService(new PrismaCompetencyStore());
const schema = z.object({
  programId: z.string().uuid(),
  elements: z.array(z.object({
    code: z.string().max(80),
    title: z.string().trim().min(1).max(240),
    method: z.string().trim().min(1).max(500),
    required: z.boolean().optional(),
  })).length(cliaCompetencyMethods.length),
});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      return NextResponse.json({ error: "Send the CLIA template as JSON." }, { status: 415 });
    }
    const input = schema.parse(await request.json());
    const data = await service.createCliaTemplate(context, { organizationId: context.organizationId, ...input });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Supply six valid CLIA assessment methods." }, { status: 422 });
    }
    if (error instanceof CompetencyEligibilityError || error instanceof CompetencyValidationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to save the CLIA methods. Retry the save." }, { status: 500 });
  }
}
