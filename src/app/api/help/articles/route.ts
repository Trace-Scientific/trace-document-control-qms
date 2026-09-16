import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { HelpContentService } from "@/lib/platform/help-content";

const service = new HelpContentService();

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const query = new URL(request.url).searchParams.get("query") ?? "";
    return NextResponse.json({ data: await service.searchPublishedArticles(query) });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Help articles could not be loaded" }, { status: 500 });
  }
}
