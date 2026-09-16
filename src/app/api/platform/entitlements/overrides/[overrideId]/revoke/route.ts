import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const schema = z.object({ reason: z.string().max(1000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ overrideId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const overrideId = z.string().uuid().parse((await params).overrideId);
    const input = schema.parse(await request.json());
    await service.revokeEntitlementOverride(context, { overrideId, reason: input.reason });
    return NextResponse.json({ ok: true });
  } catch (error) { return respondSubscriptionError(error); }
}