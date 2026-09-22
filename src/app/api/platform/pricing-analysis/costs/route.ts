import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { CommercialPricingAnalysisService } from "@/lib/platform/commercial-pricing-analysis";

const service=new CommercialPricingAnalysisService();
const schema=z.object({
  planVersionId:z.string().uuid(),
  infrastructureMonthlyCents:z.number().int().nonnegative(),
  supportMonthlyCents:z.number().int().nonnegative(),
  operationsMonthlyCents:z.number().int().nonnegative(),
  paymentFeeBasisPoints:z.number().int().min(0).max(10000),
  paymentFixedFeeCents:z.number().int().nonnegative(),
  onboardingCostCents:z.number().int().nonnegative(),
  assumptionDate:z.coerce.date(),
  notes:z.string().max(2000).nullish(),
  expectedLockVersion:z.number().int().nonnegative().nullish(),
  reason:z.string().min(1).max(1000),
});

export async function POST(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.setCostAssumption(context,schema.parse(await request.json()))},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"Cost assumption could not be saved.";
    const status=message.includes("Platform access denied")?403:400;
    return NextResponse.json({error:message},{status});
  }
}
