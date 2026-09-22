import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformSecurityService } from "@/lib/platform/security-administration";
import { PLATFORM_PERMISSIONS } from "@/lib/platform/permissions";

const service=new PlatformSecurityService();
const schema=z.object({
  permissionKeys:z.array(z.enum(PLATFORM_PERMISSIONS)).max(100),
  reason:z.string().min(1).max(1000),
});

export async function PUT(request:NextRequest,{params}:{params:Promise<{roleId:string}>}){
  try{
    const context=await authenticatePlatformRequest(request);
    const roleId=z.string().uuid().parse((await params).roleId);
    const input=schema.parse(await request.json());
    return NextResponse.json({data:await service.setRolePermissions(context,{roleId,...input})});
  }catch(error){
    const message=error instanceof Error?error.message:"Platform role permissions could not be updated.";
    const status=message.includes("Platform access denied")?403:400;
    return NextResponse.json({error:message},{status});
  }
}
