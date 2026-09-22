import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformSecurityService } from "@/lib/platform/security-administration";
import { PLATFORM_PERMISSIONS } from "@/lib/platform/permissions";

const service=new PlatformSecurityService();
const permissionSchema=z.enum(PLATFORM_PERMISSIONS);
const schema=z.object({
  name:z.string().min(1).max(160),
  description:z.string().max(1000).nullable().optional(),
  permissionKeys:z.array(permissionSchema).max(100),
  reason:z.string().min(1).max(1000),
});

export async function POST(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    const input=schema.parse(await request.json());
    return NextResponse.json({data:await service.createRole(context,input)},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"Platform role could not be created.";
    const status=message.includes("Platform access denied")?403:400;
    return NextResponse.json({error:message},{status});
  }
}
