import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { ReauthenticationFailedError, ReauthenticationThrottledError } from "@/lib/signatures/service";
import { reauthenticateCompetencySigner } from "@/lib/training/competency-assessment-signature";
import { PrismaCompetencyStore } from "@/lib/training/competency-store";
import { CompetencyEligibilityError, CompetencyService, CompetencyValidationError } from "@/lib/training/competency";

const service=new CompetencyService(new PrismaCompetencyStore());
const elementSchema=z.object({elementId:z.string().uuid(),outcome:z.enum(["PASS","FAIL","NOT_APPLICABLE"]),notes:z.string().max(1000).nullish()});
const createSchema=z.object({employeeId:z.string().uuid(),programId:z.string().uuid(),assessedAt:z.coerce.date(),outcome:z.enum(["QUALIFIED","NOT_QUALIFIED","CONDITIONAL"]),expiresAt:z.coerce.date().nullish(),fileId:z.string().uuid().nullish(),notes:z.string().max(2000).nullish(),elementResults:z.array(elementSchema).min(1),
  signature: z.object({ confirmed: z.literal(true), password: z.string().min(1).max(1024) }).optional(),
});
export async function GET(request:NextRequest){try{const context=await authenticateRequest(request);const employeeId=new URL(request.url).searchParams.get("employeeId")||undefined;return NextResponse.json({data:await service.listAssessments(context,context.organizationId,employeeId)});}catch(error){return respond(error);}}
export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId, userId } = context;
    requireAuthorization(context, { organizationId, permission: "training.manage" });
    const { signature, ...input } = createSchema.parse(await request.json());
    const signatureProof = signature ? await reauthenticateCompetencySigner(organizationId, userId, signature.password) : undefined;
    const result = await service.createAssessment(context, { organizationId, ...input, signatureProof });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof ReauthenticationFailedError) return NextResponse.json({ error: "Could not verify the signing password. Review it and retry." }, { status: 401 });
    if (error instanceof ReauthenticationThrottledError) return NextResponse.json({ error: error.message }, { status: 429 });
    return respond(error);
  }
}
function respond(error:unknown){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid competency assessment request"},{status:422});if(error instanceof CompetencyValidationError||error instanceof CompetencyEligibilityError)return NextResponse.json({error:error.message},{status:409});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"Competency assessment operation failed"},{status:500});}
