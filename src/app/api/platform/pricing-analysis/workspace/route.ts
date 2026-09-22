import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { CommercialPricingAnalysisService } from "@/lib/platform/commercial-pricing-analysis";

const service=new CommercialPricingAnalysisService();

export async function GET(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.workspace(context)},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"Commercial pricing analysis could not be loaded.";
    const status=message.includes("Platform access denied")?403:400;
    return NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
  }
}
