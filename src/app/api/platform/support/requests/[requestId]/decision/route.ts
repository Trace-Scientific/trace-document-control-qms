import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSupportAccessError } from "@/lib/platform/support-access-api";
import { SupportAccessService } from "@/lib/platform/support-access";

const service = new SupportAccessService();
const schema = z.object({
  decision: z.enum(["APPROVED", "DENIED"]),
  reason: z.string().max(1000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const requestId = z.string().uuid().parse((await params).requestId);
    const input = schema.parse(await request.json());
    await service.decideRequest(context, { requestId, ...input });
    return NextResponse.json({ data: { decided: true } });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}
