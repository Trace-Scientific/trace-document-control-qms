import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { evaluateAuthorization, requireAuthorization } from "@/lib/security/authorization";
import { listCompetencyProgramScopeOptions } from "@/lib/training/competency-program-scope";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId } = context;
    requireAuthorization(context, { organizationId, permission: "training.manage" });
    const canReadEquipment = evaluateAuthorization(context, { organizationId, permission: "equipment.read" }).allowed;
    return NextResponse.json({ data: await listCompetencyProgramScopeOptions(organizationId, canReadEquipment) });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load competency program scope options." }, { status: 500 });
  }
}
