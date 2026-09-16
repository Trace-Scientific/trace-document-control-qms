import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { HelpContentService } from "@/lib/platform/help-content";

const service = new HelpContentService();

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const now = Date.now();
    const releases = await service.listPublishedManualReleases() as Array<{ effectiveAt: Date | string }>;
    const effective = releases.filter((release) => new Date(release.effectiveAt).getTime() <= now);
    return NextResponse.json({ data: effective });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Manual releases could not be loaded" }, { status: 500 });
  }
}
