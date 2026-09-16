import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();
const createSchema = z.object({
  code: z.string().max(120),
  name: z.string().max(240),
  description: z.string().max(2000).nullish(),
  reason: z.string().max(1000),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.listProducts(context) });
  } catch (error) {
    return respondSubscriptionError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.createProduct(context, input) }, { status: 201 });
  } catch (error) {
    return respondSubscriptionError(error);
  }
}