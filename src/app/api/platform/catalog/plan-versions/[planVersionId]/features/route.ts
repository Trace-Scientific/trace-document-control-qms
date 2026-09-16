import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const schema = z.object({ featureId: z.string().uuid(), enabled: z.boolean(), reason: z.string().max(1000) });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ planVersionId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const planVersionId = z.string().uuid().parse((await params).planVersionId);
    const input = schema.parse(await request.json());
    await service.setDraftPlanFeature(context, { planVersionId, ...input });
    return NextResponse.json({ ok: true });
  } catch (error) { return respondSubscriptionError(error); }
}