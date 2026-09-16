import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformIntegrationOperationsService } from "@/lib/platform/integration-operations";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await new PlatformIntegrationOperationsService().listDeliveries(context) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
