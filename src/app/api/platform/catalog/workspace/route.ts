import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service = new SubscriptionCatalogService();

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.catalogWorkspace(context) });
  } catch (error) {
    return respondSubscriptionError(error);
  }
}
