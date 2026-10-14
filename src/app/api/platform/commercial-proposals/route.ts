import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest, PlatformAuthenticationRequiredError } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import { TraceQmsProposalStore } from "@/lib/platform/trace-qms-proposal-store";

const store = new TraceQmsProposalStore();
const proposalSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  package: z.enum(["essential", "professional", "enterprise"]).optional(),
  users: z.number().int().min(1).max(500),
  modules: z.array(z.enum(["personnel", "training", "competency", "quality_events", "laboratory_operations", "records", "reporting_analytics"])).optional(),
  additionalSites: z.number().int().nonnegative().optional(),
  annualPrepay: z.boolean().optional(),
  foundingDiscountPercent: z.number().int().min(0).max(15).optional(),
}).strict();

function respond(error: unknown) {
  if (error instanceof PlatformAuthenticationRequiredError) return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
  if (error instanceof z.ZodError || error instanceof RangeError) return NextResponse.json({ error: "Invalid commercial proposal" }, { status: 422 });
  return NextResponse.json({ error: "Commercial proposal operation failed" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await store.list(context) });
  } catch (error) { return respond(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = proposalSchema.parse(await request.json());
    return NextResponse.json({ data: await store.create(context, input) }, { status: 201 });
  } catch (error) { return respond(error); }
}
