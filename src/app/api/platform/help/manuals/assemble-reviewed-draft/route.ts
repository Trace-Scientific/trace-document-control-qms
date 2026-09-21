import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { ControlledUserManualAssemblyService } from "@/lib/platform/controlled-user-manual-assembly";

const service = new ControlledUserManualAssemblyService();
const schema = z.object({ reason: z.string().min(1).max(1000) });

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { reason } = schema.parse(await request.json());
    return NextResponse.json({ data: await service.assembleReviewedDraft(context, reason) }, { status: 201 });
  } catch (error) {
    return respondHelpContentError(error);
  }
}
