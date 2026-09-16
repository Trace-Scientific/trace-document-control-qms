import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSupportAccessError } from "@/lib/platform/support-access-api";
import { SupportAccessService } from "@/lib/platform/support-access";

const service = new SupportAccessService();
const schema = z.object({ reason: z.string().max(1000) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const sessionId = z.string().uuid().parse((await params).sessionId);
    const input = schema.parse(await request.json());
    await service.revokeSession(context, { sessionId, reason: input.reason });
    return NextResponse.json({ data: { revoked: true } });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}
