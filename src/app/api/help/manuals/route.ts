import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { HelpContentService } from "@/lib/platform/help-content";

const service = new HelpContentService();

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    return NextResponse.json({ data: await service.listPublishedManualReleases() });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Manual releases could not be loaded" }, { status: 500 });
  }
}
