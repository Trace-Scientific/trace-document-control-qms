import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";
import { platformIntegrationService } from "@/lib/platform/integration-runtime";

const schema = z.object({
  resolution: z.enum(["CONFIRMED_SUCCEEDED", "CONFIRMED_NOT_DELIVERED", "ABANDON"]),
  reason: z.string().min(1).max(1000),
  providerRequestId: z.string().max(500).nullable().optional(),
  providerObjectId: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { deliveryId } = await params;
    const body = schema.parse(await request.json());
    return NextResponse.json({
      data: await platformIntegrationService.reconcileDelivery(context, {
        deliveryId,
        resolution: body.resolution,
        reason: body.reason,
        providerRequestId: body.providerRequestId,
        providerObjectId: body.providerObjectId,
      }),
    });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
