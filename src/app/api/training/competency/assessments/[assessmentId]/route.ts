import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { PrismaCompetencyStore } from "@/lib/training/competency-store";

const store = new PrismaCompetencyStore();

export async function GET(request: NextRequest, { params }: { params: Promise<{ assessmentId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId } = context;
    requireAuthorization(context, { organizationId, permission: "training.read" });
    const assessmentId = z.string().uuid().parse((await params).assessmentId);
    const observations = await store.readAssessmentObservations(organizationId, assessmentId);
    if (!observations) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
    const signature = await store.readAssessmentSignature(organizationId, assessmentId);
    return NextResponse.json({ data: observations, signature });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid assessment ID." }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load assessment observations." }, { status: 500 });
  }
}
