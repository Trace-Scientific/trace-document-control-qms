import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSupportAccessError } from "@/lib/platform/support-access-api";
import { SupportAccessService } from "@/lib/platform/support-access";

const service = new SupportAccessService();
const createSchema = z.object({
  customerAccountId: z.string().uuid(),
  caseNumber: z.string().max(120),
  title: z.string().max(300),
  description: z.string().max(4000).nullish(),
  reason: z.string().max(1000),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.listCases(context) });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.createCase(context, input) }, { status: 201 });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}
