import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest,AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { EquipmentComplianceService,EquipmentComplianceValidationError } from "@/lib/equipment/compliance";
import { PrismaEquipmentComplianceStore } from "@/lib/equipment/compliance-store";
const service=new EquipmentComplianceService(new PrismaEquipmentComplianceStore());
const schema=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("CLEAR_HOLD"),holdId:z.string().uuid(),reason:z.string().max(1000)}),
 z.object({operation:z.literal("ASSESS_IMPACT"),holdId:z.string().uuid().nullish(),disposition:z.enum(["NO_IMPACT","POTENTIAL_IMPACT","CONFIRMED_IMPACT"]),scopeSummary:z.string().max(5000),rationale:z.string().max(5000)})
]);
export async function GET(request: NextRequest, { params }: { params: Promise<{ equipmentId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const equipmentId = z.uuid().parse((await params).equipmentId);
    const [data, impactHistory] = await Promise.all([
      service.listHolds(context, context.organizationId, equipmentId),
      service.listImpactHistory(context, equipmentId),
    ]);
    return NextResponse.json({ data, impactHistory }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respond(error);
  }
}
export async function POST(request:NextRequest,{params}:{params:Promise<{equipmentId:string}>}){try{const context=await authenticateRequest(request);const {equipmentId}=await params;const input=schema.parse(await request.json());const data=input.operation==="CLEAR_HOLD"?await service.clearHold(context,{organizationId:context.organizationId,equipmentId,holdId:input.holdId,reason:input.reason}):await service.assess(context,{organizationId:context.organizationId,equipmentId,holdId:input.holdId??null,disposition:input.disposition,scopeSummary:input.scopeSummary,rationale:input.rationale});return NextResponse.json({data});}catch(error){return respond(error);}}
function respond(error:unknown){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid equipment compliance request"},{status:422});if(error instanceof EquipmentComplianceValidationError)return NextResponse.json({error:error.message},{status:409});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"Equipment compliance operation failed"},{status:500});}
