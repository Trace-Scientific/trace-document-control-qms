import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const schema = z.object({ reason: z.string().max(1000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ planVersionId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const planVersionId = z.string().uuid().parse((await params).planVersionId);
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await service.activatePlanVersion(context, { planVersionId, reason: input.reason, businessApprovalReason: input.businessApprovalReason }) });
  } catch (error) { return respondSubscriptionError(error); }
}