import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { competencyCoverageByEmployee } from "@/lib/training/competency-coverage";
import { listRemediationCoverage } from "@/lib/training/competency-remediation";
import { listCompetencyRequirements } from "@/lib/training/competency-requirements-store";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId } = context;
    requireAuthorization(context, { organizationId, permission: "training.read" });
    requireAuthorization(context, { organizationId, permission: "personnel.read" });
    const asOf = new Date().toISOString().slice(0, 10);
    const [{ rows }, remediation] = await Promise.all([
      listCompetencyRequirements(organizationId, false),
      listRemediationCoverage(organizationId, asOf),
    ]);
    return NextResponse.json({ asOf, data: competencyCoverageByEmployee(rows, asOf), remediation },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load competency coverage." }, { status: 500 });
  }
}
