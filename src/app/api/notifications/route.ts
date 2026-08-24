import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest,AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { inAppTransport,PrismaDeliveryStore } from "@/lib/notifications/prisma-store";
import { NotificationConflictError,NotificationDeliveryService,NotificationInboxService,NotificationValidationError } from "@/lib/notifications/service";
const uuid=z.string().uuid(),store=new PrismaDeliveryStore(),inbox=new NotificationInboxService(store);
const command=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("READ"),organizationId:uuid,notificationId:uuid}),
 z.object({operation:z.literal("REQUEUE"),organizationId:uuid,notificationId:uuid}),
 z.object({operation:z.literal("PROCESS"),organizationId:uuid,workerId:z.string().min(3).max(100),limit:z.number().int().min(1).max(100).default(50)})
]);
export async function GET(request:NextRequest){try{const context=await authenticateRequest(request),organizationId=uuid.parse(request.nextUrl.searchParams.get("organizationId")),view=request.nextUrl.searchParams.get("view");return NextResponse.json({data:view==="failures"?await inbox.failures(context,organizationId):await inbox.list(context,organizationId)});}catch(error){return failure(error);}}
export async function POST(request:NextRequest){try{const context=await authenticateRequest(request),input=command.parse(await request.json());let data;if(input.operation==="READ")data=await inbox.markRead(context,input);else if(input.operation==="REQUEUE")data=await inbox.requeue(context,input);else{requireAuthorization(context,{organizationId:input.organizationId,permission:"notification.manage"});const unavailableEmail={async deliver(){throw new Error("Email transport is not configured");}};data=await new NotificationDeliveryService(store,{IN_APP:inAppTransport,EMAIL:unavailableEmail}).process(input.organizationId,input.workerId,input.limit);}return NextResponse.json({data});}catch(error){return failure(error);}}
function failure(error:unknown){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof NotificationConflictError)return NextResponse.json({error:error.message},{status:409});if(error instanceof z.ZodError||error instanceof NotificationValidationError)return NextResponse.json({error:"The notification request is invalid"},{status:422});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"Unable to process notifications"},{status:500});}
