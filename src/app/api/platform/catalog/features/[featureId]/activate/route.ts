import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { activateFeature } from "@/lib/platform/catalog-lifecycle";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const schema = z.object({ reason: z.string().max(1000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ featureId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const featureId = z.string().uuid().parse((await params).featureId);
    const input = schema.parse(await request.json());
    await activateFeature(context, { featureId, reason: input.reason });
    return NextResponse.json({ ok: true });
  } catch (error) { return respondSubscriptionError(error); }
}