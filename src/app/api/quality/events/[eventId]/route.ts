import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaQualityEventStore } from "@/lib/quality/events-store";
import { QualityEventService, QualityEventValidationError } from "@/lib/quality/events";

const service=new QualityEventService(new PrismaQualityEventStore());
const updateSchema=z.object({
  reason:z.string().max(1000),
  status:z.enum(["OPEN","INVESTIGATING","ACTION_REQUIRED","VERIFICATION","CLOSED"]).optional(),
  ownerUserId:z.string().uuid().nullable().optional(),
  dueAt:z.coerce.date().nullable().optional(),
});

const eventIdSchema = z.uuid();
const readHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await authenticateRequest(request);
    const eventId = eventIdSchema.parse((await params).eventId);
    const data = await service.getIntake(context, eventId);
    if (!data) return NextResponse.json({ error: "Quality event not found" }, { status: 404, headers: readHeaders });
    return NextResponse.json({ data }, { headers: readHeaders });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: readHeaders });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers: readHeaders });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid quality event ID" }, { status: 422, headers: readHeaders });
    }
    return NextResponse.json({ error: "Unable to load the original quality event report" }, { status: 500, headers: readHeaders });
  }
}

export async function PATCH(request:NextRequest,{params}:{params:Promise<{eventId:string}>}){
  try{
    const context=await authenticateRequest(request);
    const {eventId}=await params;
    const input=updateSchema.parse(await request.json());
    return NextResponse.json({data:await service.updateLifecycle(context,{organizationId:context.organizationId,eventId,...input})});
  }catch(error){return respond(error);}
}

function respond(error:unknown){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid quality event lifecycle request"},{status:422});if(error instanceof QualityEventValidationError)return NextResponse.json({error:error.message},{status:409});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"Quality event lifecycle operation failed"},{status:500});}
