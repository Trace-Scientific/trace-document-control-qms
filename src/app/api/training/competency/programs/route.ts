import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { competencyScheduleMaxDays } from "@/lib/training/competency-schedule";
import { PrismaCompetencyStore } from "@/lib/training/competency-store";
import { CompetencyEligibilityError, CompetencyService, CompetencyValidationError } from "@/lib/training/competency";

const service=new CompetencyService(new PrismaCompetencyStore());
const createSchema=z.object({code:z.string().max(80),title:z.string().max(240),description:z.string().max(2000).nullish(),validityDays:z.number().int().positive().max(3650).nullish(),
  initialDueDays: z.number().int().min(0).max(competencyScheduleMaxDays).nullish(),
  firstReassessmentDays: z.number().int().min(1).max(competencyScheduleMaxDays).nullish(),
  reassessmentIntervalDays: z.number().int().min(1).max(competencyScheduleMaxDays).nullish(),
  equipmentId: z.string().uuid().nullish(),
  testSystemId: z.string().uuid().nullish(),
  newTestSystem: z.object({ code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(240) }).nullish()});
export async function GET(request:NextRequest){try{const context=await authenticateRequest(request);return NextResponse.json({data:await service.listPrograms(context,context.organizationId)});}catch(error){return respond(error);}}
export async function POST(request:NextRequest){try{const context=await authenticateRequest(request);const input=createSchema.parse(await request.json());return NextResponse.json({data:await service.createProgram(context,{organizationId:context.organizationId,...input})},{status:201});}catch(error){return respond(error);}}
function respond(error:unknown){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid competency program request"},{status:422});if(error instanceof CompetencyValidationError||error instanceof CompetencyEligibilityError)return NextResponse.json({error:error.message},{status:409});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"Competency program operation failed"},{status:500});}
