import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { platformIntegrationService } from "@/lib/platform/integration-runtime";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

const schema = z.object({
  connectionId: z.string().uuid(),
  eventType: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1).max(240),
  correlationId: z.string().uuid().nullable().optional(),
  reason: z.string().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await platformIntegrationService.enqueueOutbound(context, input) }, { status: 202 });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
