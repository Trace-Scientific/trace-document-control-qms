import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaQualityCapaStore } from "@/lib/quality/capa-store";
import { QualityCapaService, QualityCapaValidationError } from "@/lib/quality/capa";

const service=new QualityCapaService(new PrismaQualityCapaStore());
const createSchema=z.object({actionType:z.enum(["CORRECTIVE","PREVENTIVE"]),description:z.string().max(5000),ownerUserId:z.string().uuid(),dueAt:z.coerce.date()});

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const { eventId } = await params;
    const [data, effectivenessChecks] = await Promise.all([
      service.list(context, context.organizationId, eventId),
      service.listEffectivenessHistory(context, eventId),
    ]);
    return NextResponse.json({ data, effectivenessChecks });
  } catch (error) {
    return respond(error);
  }
}
export async function POST(request:NextRequest,{params}:{params:Promise<{eventId:string}>}){try{const context=await authenticateRequest(request);const {eventId}=await params;const input=createSchema.parse(await request.json());return NextResponse.json({data:await service.create(context,{organizationId:context.organizationId,eventId,...input})},{status:201});}catch(error){return respond(error);}}
function respond(error:unknown){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid CAPA request"},{status:422});if(error instanceof QualityCapaValidationError)return NextResponse.json({error:error.message},{status:409});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"CAPA operation failed"},{status:500});}
