import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const schema = z.object({
  billingCadence: z.enum(["MONTHLY","ANNUAL","CUSTOM"]),
  currency: z.string().length(3),
  baseAmountCents: z.number().int().nonnegative(),
  includedFullUsers: z.number().int().nonnegative(),
  additionalUserRateCents: z.number().int().nonnegative().nullish(),
  storageAllowanceGb: z.number().int().nonnegative().nullish(),
  commercialMetadata: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1).max(1000),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ planVersionId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const planVersionId = z.string().uuid().parse((await params).planVersionId);
    return NextResponse.json({
      data: await service.setDraftCommercialTerms(context, { planVersionId, ...schema.parse(await request.json()) }),
    });
  } catch (error) {
    return respondSubscriptionError(error);
  }
}
