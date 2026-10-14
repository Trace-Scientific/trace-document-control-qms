import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest, PlatformAuthenticationRequiredError } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import { TraceQmsProposalStore } from "@/lib/platform/trace-qms-proposal-store";

const store = new TraceQmsProposalStore();

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const proposalId = request.nextUrl.searchParams.get("proposalId") ?? "";
    const history = await store.history(context, proposalId);
    if (history === null) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    return NextResponse.json({ data: history });
  } catch (error) {
    if (error instanceof PlatformAuthenticationRequiredError) return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
    if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
    if (error instanceof RangeError) return NextResponse.json({ error: "Invalid proposal ID" }, { status: 422 });
    return NextResponse.json({ error: "Unable to retrieve proposal history" }, { status: 500 });
  }
}
