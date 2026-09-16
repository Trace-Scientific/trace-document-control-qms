import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const schema = z.object({
  customerAccountId: z.string().uuid(),
  planVersionId: z.string().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullish(),
  reason: z.string().max(1000),
});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.createSubscription(context, schema.parse(await request.json())) }, { status: 201 });
  } catch (error) { return respondSubscriptionError(error); }
}