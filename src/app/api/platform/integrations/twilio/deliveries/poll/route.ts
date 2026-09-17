import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { requirePlatformAuthorization } from "@/lib/platform/authorization";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";
import { platformTwilioDeliveryMonitoringService } from "@/lib/platform/integration-runtime";

const schema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const body = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({
      data: await platformTwilioDeliveryMonitoringService.pollDue(body.limit ?? 25),
    });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
