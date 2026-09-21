import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { helpRecommendations } from "@/lib/help/help-recommendations";

const safeContexts = new Set(["help","documents","review-queue","administration","records","personnel","training","quality","laboratory","reporting"]);

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const requested = new URL(request.url).searchParams.get("context") ?? "help";
    const pageContext = safeContexts.has(requested) ? requested : "help";
    return NextResponse.json({ data: helpRecommendations(context, pageContext), pageContext });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Help recommendations could not be loaded" }, { status: 500 });
  }
}
