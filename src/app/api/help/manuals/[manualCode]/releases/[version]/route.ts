import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { HelpContentNotFoundError, HelpContentService } from "@/lib/platform/help-content";

const service = new HelpContentService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ manualCode: string; version: string }> },
) {
  try {
    await authenticateRequest(request);
    const { manualCode, version } = await params;
    return NextResponse.json({ data: await service.getPublishedManualRelease(manualCode, version) });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof HelpContentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Manual release could not be loaded" }, { status: 500 });
  }
}
