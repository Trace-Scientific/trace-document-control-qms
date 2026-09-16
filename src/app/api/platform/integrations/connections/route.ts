import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { platformIntegrationService } from "@/lib/platform/integration-runtime";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

const createSchema = z.object({
  adapterKey: z.string().min(1).max(160),
  displayName: z.string().min(1).max(240),
  credentialRef: z.string().max(500).nullable().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1).max(1000),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await platformIntegrationService.listConnections(context) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await platformIntegrationService.createConnection(context, { ...input, configuration: (input.configuration ?? {}) as Prisma.InputJsonObject }) }, { status: 201 });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
