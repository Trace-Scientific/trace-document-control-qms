import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const schema = z.object({
  toStatus: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]),
  expectedLockVersion: z.number().int().nonnegative(),
  reason: z.string().max(1000),
  planVersionId: z.string().uuid().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ subscriptionId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const subscriptionId = z.string().uuid().parse((await params).subscriptionId);
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await service.transitionSubscription(context, { subscriptionId, ...input }) });
  } catch (error) { return respondSubscriptionError(error); }
}