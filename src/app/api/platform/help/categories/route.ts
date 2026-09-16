import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { HelpContentService } from "@/lib/platform/help-content";

const service = new HelpContentService();
const schema = z.object({ code: z.string().min(1).max(120), name: z.string().min(1).max(240), description: z.string().max(1000).nullable().optional(), displayOrder: z.number().int().optional(), reason: z.string().min(1).max(1000) });

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.createCategory(context, schema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return respondHelpContentError(error);
  }
}
