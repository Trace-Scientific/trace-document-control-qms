import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformIntegrationOperationsService } from "@/lib/platform/integration-operations";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

const schema = z.object({ reason: z.string().min(1).max(1000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { deliveryId } = await params;
    const { reason } = schema.parse(await request.json());
    return NextResponse.json({ data: await new PlatformIntegrationOperationsService().requeueDeadLetter(context, deliveryId, reason) });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
