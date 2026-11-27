import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaQualityClosureStore } from "@/lib/quality/closure-store";
import { QualityClosureService } from "@/lib/quality/closure";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";

const service = new QualityClosureService(new PrismaQualityClosureStore());
const eventIdSchema = z.string().uuid();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const eventId = eventIdSchema.parse((await params).eventId);
    const readiness = await service.readReadiness(context, eventId);
    if (!readiness) return NextResponse.json({ error: "Quality event not found" }, { status: 404, headers });
    return NextResponse.json({ data: readiness }, { headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid quality event ID" }, { status: 422, headers });
    }
    return NextResponse.json({ error: "Unable to load closure prerequisites" }, { status: 500, headers });
  }
}
