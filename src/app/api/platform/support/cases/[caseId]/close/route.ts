import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSupportAccessError } from "@/lib/platform/support-access-api";
import { SupportAccessService } from "@/lib/platform/support-access";

const service = new SupportAccessService();
const schema = z.object({ reason: z.string().max(1000) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const caseId = z.string().uuid().parse((await params).caseId);
    const input = schema.parse(await request.json());
    await service.closeCase(context, { caseId, reason: input.reason });
    return NextResponse.json({ data: { closed: true } });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}
