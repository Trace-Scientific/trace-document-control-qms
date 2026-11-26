import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { evaluateAuthorization, requireAuthorization } from "@/lib/security/authorization";
import { renderCompetencyAssessment, type PrintableCompetencyAssessment } from "@/lib/training/competency-assessment-print";
import { competencyScopeJoins, competencyScopeLabel } from "@/lib/training/competency-program-scope";
import { PrismaCompetencyStore } from "@/lib/training/competency-store";

type Summary = Omit<PrintableCompetencyAssessment, "observations" | "signature">;
const store = new PrismaCompetencyStore();

export async function GET(request: NextRequest, { params }: { params: Promise<{ assessmentId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId, userId } = context;
    requireAuthorization(context, { organizationId, permission: "training.read" });
    requireAuthorization(context, { organizationId, permission: "personnel.read" });
    const assessmentId = z.string().uuid().parse((await params).assessmentId);
    const includeEquipment = evaluateAuthorization(context, { organizationId, permission: "equipment.read" }).allowed;
    const [summary] = await db.$queryRaw<Summary[]>`
      SELECT a."id", org."displayName" AS "organizationName", employee."employeeNumber",
        concat_ws(' ', employee."firstName", employee."lastName") AS "employeeName",
        p."code" AS "programCode", p."title" AS "programTitle", ${competencyScopeLabel} AS "scopeLabel",
        concat_ws(' ', evaluator."firstName", evaluator."lastName") AS "assessorName", a."assessorUserId",
        a."assessedAt", a."expiresAt"::text AS "expiresOn", a."outcome", a."notes",
        a."fileId", file."originalName" AS "fileName", previous."assessedAt" AS "previousAssessmentAt"
      FROM "CompetencyAssessment" a
      JOIN "Organization" org ON org."id" = a."organizationId"
      JOIN "Employee" employee ON (employee."organizationId", employee."id") = (a."organizationId", a."employeeId")
      JOIN "User" evaluator ON (evaluator."organizationId", evaluator."id") = (a."organizationId", a."assessorUserId")
      JOIN "CompetencyProgram" p ON (p."organizationId", p."id") = (a."organizationId", a."programId")
      ${competencyScopeJoins(includeEquipment)}
      LEFT JOIN "FileObject" file ON (file."organizationId", file."id") = (a."organizationId", a."fileId")
      LEFT JOIN LATERAL (
        SELECT earlier."assessedAt" FROM "CompetencyAssessment" earlier
        WHERE earlier."organizationId" = a."organizationId" AND earlier."employeeId" = a."employeeId"
          AND earlier."programId" = a."programId" AND earlier."assessedAt" < a."assessedAt"
        ORDER BY earlier."assessedAt" DESC LIMIT 1
      ) previous ON true
      WHERE a."organizationId" = ${organizationId}::uuid AND a."id" = ${assessmentId}::uuid
    `;
    if (!summary) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
    const [observations, signature] = await Promise.all([
      store.readAssessmentObservations(organizationId, assessmentId),
      store.readAssessmentSignature(organizationId, assessmentId),
    ]);
    if (!observations) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
    const html = renderCompetencyAssessment({ ...summary, observations, signature });
    await db.auditEvent.create({ data: {
      organizationId, actorUserId: userId, action: "COMPETENCY_ASSESSMENT_PRINT_VIEW_GENERATED",
      entityType: "CompetencyAssessment", entityId: assessmentId,
      metadata: { methodCount: observations.length, signatureStatus: signature?.status ?? null },
    } });
    return new NextResponse(html, { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid assessment ID." }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to generate the assessment record." }, { status: 500 });
  }
}
