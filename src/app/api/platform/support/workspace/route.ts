import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { SupportAccessWorkspaceService } from "@/lib/platform/support-access-workspace";
import { respondSupportAccessError } from "@/lib/platform/support-access-api";

const service=new SupportAccessWorkspaceService();

export async function GET(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.load(context)},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return respondSupportAccessError(error);
  }
}
