import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformSecurityService } from "@/lib/platform/security-administration";

const service=new PlatformSecurityService();
const schema=z.object({membershipId:z.string().uuid(),roleId:z.string().uuid(),reason:z.string().min(1).max(1000)});

export async function POST(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    return NextResponse.json({data:await service.unassignRole(context,schema.parse(await request.json()))});
  }catch(error){
    const message=error instanceof Error?error.message:"Platform role unassignment failed.";
    const status=message.includes("Platform access denied")?403:400;
    return NextResponse.json({error:message},{status});
  }
}
