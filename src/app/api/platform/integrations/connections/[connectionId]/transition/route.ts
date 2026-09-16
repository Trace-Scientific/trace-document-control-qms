import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformIntegrationService } from "@/lib/platform/integration-framework";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

const schema = z.object({
  toStatus: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "REVOKED"]),
  expectedLockVersion: z.number().int().min(0),
  reason: z.string().min(1).max(1000),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { connectionId } = await params;
    const input = schema.parse(await request.json());
    const service = new PlatformIntegrationService();
    return NextResponse.json({ data: await service.transitionConnection(context, { connectionId, ...input }) });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
