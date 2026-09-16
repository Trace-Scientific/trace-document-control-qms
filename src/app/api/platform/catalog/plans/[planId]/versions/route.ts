import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const schema = z.object({ effectiveFrom: z.coerce.date().nullish(), effectiveTo: z.coerce.date().nullish(), reason: z.string().max(1000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const planId = z.string().uuid().parse((await params).planId);
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await service.createPlanVersion(context, { planId, ...input }) }, { status: 201 });
  } catch (error) { return respondSubscriptionError(error); }
}