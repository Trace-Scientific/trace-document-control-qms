import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest,AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaReviewStore } from "@/lib/reviews/prisma-store";
import { DocumentReviewService,ReviewConflictError,ReviewValidationError } from "@/lib/reviews/service";
const uuid=z.string().uuid();const service=new DocumentReviewService(new PrismaReviewStore());
const command=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("MONITOR"),organizationId:uuid}),
 z.object({operation:z.literal("COMPLETE"),organizationId:uuid,taskId:uuid,outcome:z.enum(["NO_CHANGE","REVISION_REQUIRED","RETIREMENT_REQUIRED"]),comments:z.string().max(4000)})
]);
export async function GET(request:NextRequest){try{const context=await authenticateRequest(request);const organizationId=uuid.parse(request.nextUrl.searchParams.get("organizationId"));return NextResponse.json({data:await service.listOutstanding(context,organizationId)});}catch(error){return failure(error,"Unable to list document reviews");}}
export async function POST(request:NextRequest){try{const context=await authenticateRequest(request);const input=command.parse(await request.json());const data=input.operation==="MONITOR"?await service.monitor(context,input.organizationId):await service.complete(context,input);return NextResponse.json({data});}catch(error){return failure(error,"Unable to process document review");}}
function failure(error:unknown,fallback:string){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof ReviewConflictError)return NextResponse.json({error:error.message},{status:409});if(error instanceof z.ZodError||error instanceof ReviewValidationError)return NextResponse.json({error:"The document review request is invalid"},{status:422});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:fallback},{status:500});}
