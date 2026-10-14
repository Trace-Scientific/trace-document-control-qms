import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest, PlatformAuthenticationRequiredError } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import { ProposalTransitionConflictError, TraceQmsProposalStore } from "@/lib/platform/trace-qms-proposal-store";

const store = new TraceQmsProposalStore();
const schema = z.object({
  proposalId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(["SUBMIT", "APPROVE", "REJECT"]),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await store.transition(context, input) });
  } catch (error) {
    if (error instanceof PlatformAuthenticationRequiredError) return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
    if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
    if (error instanceof z.ZodError || error instanceof RangeError) return NextResponse.json({ error: "Invalid approval request" }, { status: 422 });
    if (error instanceof ProposalTransitionConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Proposal transition failed" }, { status: 500 });
  }
}
