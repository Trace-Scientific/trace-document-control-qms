import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformIntegrationService } from "@/lib/platform/integration-framework";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

const createSchema = z.object({
  adapterKey: z.string().min(1).max(160),
  displayName: z.string().min(1).max(240),
  credentialRef: z.string().max(500).nullable().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1).max(1000),
});

const service = new PlatformIntegrationService();

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.listConnections(context) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.createConnection(context, input) }, { status: 201 });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
