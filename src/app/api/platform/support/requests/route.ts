import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSupportAccessError } from "@/lib/platform/support-access-api";
import { SUPPORT_CAPABILITIES, SupportAccessService } from "@/lib/platform/support-access";

const service = new SupportAccessService();
const createSchema = z.object({
  caseId: z.string().uuid(),
  reason: z.string().max(1000),
  durationMinutes: z.number().int().min(5).max(240),
  capabilities: z.array(z.enum(SUPPORT_CAPABILITIES)).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.listRequests(context) });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.requestAccess(context, input) }, { status: 201 });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}
