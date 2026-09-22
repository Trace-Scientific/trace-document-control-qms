import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { BillingProviderLinkService } from "@/lib/platform/billing-provider-linkage";
import { respondSubscriptionError } from "@/lib/platform/subscription-api";

const service=new BillingProviderLinkService();
const schema=z.object({reason:z.string().min(1).max(1000)});

export async function POST(request:NextRequest,{params}:{params:Promise<{linkId:string}>}){
  try{
    const context=await authenticatePlatformRequest(request);
    const linkId=z.string().uuid().parse((await params).linkId);
    const input=schema.parse(await request.json());
    return NextResponse.json({data:await service.revoke(context,{linkId,reason:input.reason})});
  }catch(error){return respondSubscriptionError(error);}
}
