import { NextRequest, NextResponse } from "next/server";
import { QualityCapaService } from "@/lib/quality/capa";
import { PrismaQualityCapaStore } from "@/lib/quality/capa-store";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";

const service = new QualityCapaService(new PrismaQualityCapaStore());

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    return NextResponse.json({ data: await service.listWorklist(context) });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load the CAPA worklist" }, { status: 500 });
  }
}
