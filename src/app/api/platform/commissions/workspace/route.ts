import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service=new SalesCommissionService();

export async function GET(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.commissionWorkspace(context)});
  }catch(error){
    return respondSalesCommissionError(error);
  }
}
