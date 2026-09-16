import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { HelpContentNotFoundError, HelpContentService } from "@/lib/platform/help-content";

const service = new HelpContentService();

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await authenticateRequest(request);
    const { slug } = await params;
    return NextResponse.json({ data: await service.getPublishedArticle(slug) });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof HelpContentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Help article could not be loaded" }, { status: 500 });
  }
}
