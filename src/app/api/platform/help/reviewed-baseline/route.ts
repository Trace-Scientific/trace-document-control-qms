import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { ReviewedHelpBaselineService } from "@/lib/platform/reviewed-help-baseline-service";
const service=new ReviewedHelpBaselineService();
const schema=z.object({action:z.enum(["assemble","publish"]),reason:z.string().min(1).max(1000)});
export async function GET(request:NextRequest){try{const context=await authenticatePlatformRequest(request);return NextResponse.json({data:await service.status(context)});}catch(e){return respondHelpContentError(e);}}
export async function POST(request:NextRequest){try{const context=await authenticatePlatformRequest(request);const input=schema.parse(await request.json());const data=input.action==="assemble"?await service.assemble(context,input.reason):await service.publish(context,input.reason);return NextResponse.json({data});}catch(e){return respondHelpContentError(e);}}
