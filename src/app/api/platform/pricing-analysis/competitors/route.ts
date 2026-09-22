import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { CommercialPricingAnalysisService } from "@/lib/platform/commercial-pricing-analysis";

const service=new CommercialPricingAnalysisService();
const schema=z.object({
  competitorName:z.string().min(1).max(240),
  offeringName:z.string().max(240).nullish(),
  billingCadence:z.enum(["MONTHLY","ANNUAL","CUSTOM"]).nullish(),
  currency:z.string().regex(/^[A-Za-z]{3}$/).transform(v=>v.toUpperCase()).nullish(),
  amountCents:z.number().int().nonnegative().nullish(),
  includedUsers:z.number().int().nonnegative().nullish(),
  sourceLabel:z.string().min(1).max(500),
  sourceUrl:z.string().url().max(2000).nullish(),
  observedOn:z.coerce.date(),
  notes:z.string().max(2000).nullish(),
  reason:z.string().min(1).max(1000),
});

export async function POST(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.addCompetitorObservation(context,schema.parse(await request.json()))},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"Competitive price observation could not be saved.";
    const status=message.includes("Platform access denied")?403:400;
    return NextResponse.json({error:message},{status});
  }
}
