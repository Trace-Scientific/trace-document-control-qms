import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest,AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { EquipmentRecallService,EquipmentRecallValidationError } from "@/lib/equipment/recall";
import { PrismaEquipmentRecallStore } from "@/lib/equipment/recall-store";
const service=new EquipmentRecallService(new PrismaEquipmentRecallStore());
const equipmentIdSchema = z.uuid();
const schema=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("OPEN"),reason:z.string().max(2000),scopeSummary:z.string().max(5000)}),
 z.object({operation:z.literal("CLOSE"),recallId:z.string().uuid(),reason:z.string().max(2000)})
]);
export async function GET(request:NextRequest,{params}:{params:Promise<{equipmentId:string}>}){try{const context=await authenticateRequest(request);const equipmentId=equipmentIdSchema.parse((await params).equipmentId);return NextResponse.json({data:await service.list(context,context.organizationId,equipmentId)},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return respond(error);}}
export async function POST(request:NextRequest,{params}:{params:Promise<{equipmentId:string}>}){try{const context=await authenticateRequest(request);const equipmentId=equipmentIdSchema.parse((await params).equipmentId);const input=schema.parse(await request.json());const data=input.operation==="OPEN"?await service.open(context,{organizationId:context.organizationId,equipmentId,reason:input.reason,scopeSummary:input.scopeSummary}):await service.close(context,{organizationId:context.organizationId,equipmentId,recallId:input.recallId,reason:input.reason});return NextResponse.json({data},{status:input.operation==="OPEN"?201:200});}catch(error){return respond(error);}}
function respond(error:unknown){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid equipment recall request"},{status:422});if(error instanceof EquipmentRecallValidationError)return NextResponse.json({error:error.message},{status:409});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"Equipment recall operation failed"},{status:500});}
