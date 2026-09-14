import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaRecordStore } from "@/lib/records/record-store";
import { RecordService, RecordValidationError } from "@/lib/records/records";

const service = new RecordService(new PrismaRecordStore());
const createSchema = z.object({
  code: z.string().max(40),
  name: z.string().max(200),
  description: z.string().max(1000).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    return NextResponse.json({ data: await service.listTypes(context, context.organizationId) });
  } catch (error) {
    return respond(error, "list");
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.createType(context, { organizationId: context.organizationId, ...input }) }, { status: 201 });
  } catch (error) {
    return respond(error, "create");
  }
}

function respond(error: unknown, operation: "list" | "create") {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid record type request" }, { status: 422 });
  if (error instanceof RecordValidationError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  console.error("Unexpected record type operation failure", { operation, error });
  return NextResponse.json({ error: "Record type operation failed" }, { status: 500 });
}
