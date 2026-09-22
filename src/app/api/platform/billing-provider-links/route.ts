import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { BillingProviderLinkService } from "@/lib/platform/billing-provider-linkage";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service=new BillingProviderLinkService();
const createSchema=z.object({
  connectionId:z.string().uuid(),
  entityType:z.enum(["CUSTOMER","SUBSCRIPTION"]),
  customerAccountId:z.string().uuid().optional(),
  subscriptionId:z.string().uuid().optional(),
  providerObjectId:z.string().min(1).max(500),
  reason:z.string().min(1).max(1000),
});

export async function GET(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.list(context)});
  }catch(error){return respondSubscriptionError(error);}
}

export async function POST(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.create(context,createSchema.parse(await request.json()))},{status:201});
  }catch(error){return respondSubscriptionError(error);}
}
