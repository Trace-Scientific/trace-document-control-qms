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
  contractBillingCadence: z.enum(["MONTHLY","ANNUAL","CUSTOM"]).nullish(),
  contractCurrency: z.string().regex(/^[A-Za-z]{3}$/).transform((value)=>value.toUpperCase()).nullish(),
  contractBaseAmountCents: z.number().int().nonnegative().nullish(),
  contractIncludedFullUsers: z.number().int().nonnegative().nullish(),
  contractAdditionalUserRateCents: z.number().int().nonnegative().nullish(),
  contractStorageAllowanceGb: z.number().int().nonnegative().nullish(),
  contractTermsNote: z.string().max(1000).nullish(),
  reason: z.string().max(1000),
});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.createSubscription(context, schema.parse(await request.json())) }, { status: 201 });
  } catch (error) { return respondSubscriptionError(error); }
}