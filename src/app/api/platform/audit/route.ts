import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformAuditReadService } from "@/lib/platform/audit-read";

const service=new PlatformAuditReadService();

const querySchema=z.object({
  action:z.string().max(200).optional(),
  entityType:z.string().max(200).optional(),
  actorIdentityId:z.string().uuid().optional(),
  from:z.string().datetime().transform(v=>new Date(v)).optional(),
  to:z.string().datetime().transform(v=>new Date(v)).optional(),
  cursorOccurredAt:z.string().datetime().transform(v=>new Date(v)).optional(),
  cursorId:z.string().uuid().optional(),
  limit:z.coerce.number().int().min(1).max(200).optional(),
}).refine(v=>(v.cursorOccurredAt===undefined)===(v.cursorId===undefined),{
  message:"cursorOccurredAt and cursorId must be provided together"
});

export async function GET(request:NextRequest){
  try{
    const context=await authenticatePlatformRequest(request);
    const raw=Object.fromEntries(request.nextUrl.searchParams.entries());
    const query=querySchema.parse(raw);
    const data=await service.list(context,query);
    return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"Platform audit could not be loaded.";
    const status=message.includes("Platform access denied")?403:400;
    return NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
  }
}
