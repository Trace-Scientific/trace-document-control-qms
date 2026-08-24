import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authenticateRequest,AuthenticationRequiredError} from "@/lib/security/authenticated-request";
import {DocumentQueryService} from "@/lib/documents/query";
import {PrismaDocumentQueryStore} from "@/lib/documents/query-store";
const service=new DocumentQueryService(new PrismaDocumentQueryStore());
export async function GET(request:NextRequest,{params}:{params:Promise<{versionId:string}>}){try{const context=await authenticateRequest(request),{versionId}=await params;return NextResponse.json({data:await service.detail(context,{organizationId:context.organizationId,versionId:z.string().uuid().parse(versionId)})});}catch(error){if(error instanceof AuthenticationRequiredError)return NextResponse.json({error:"Authentication required"},{status:401});if(error instanceof z.ZodError)return NextResponse.json({error:"The document identifier is invalid"},{status:422});if(error instanceof Error&&error.message==="Access denied")return NextResponse.json({error:"Access denied"},{status:403});return NextResponse.json({error:"Unable to load document detail"},{status:500});}}
