import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { QualityEventService } from "@/lib/quality/events";
import { PrismaQualityEventStore } from "@/lib/quality/events-store";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";

const service = new QualityEventService(new PrismaQualityEventStore());
const eventIdSchema = z.uuid();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const eventId = eventIdSchema.parse((await params).eventId);
    const data = await service.listLifecycleHistory(context, eventId);
    return NextResponse.json({ data }, { headers });
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
    return NextResponse.json({ error: "Unable to load quality event history" }, { status: 500, headers });
  }
}
