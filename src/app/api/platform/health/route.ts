import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest, PlatformAuthenticationRequiredError } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import { PlatformSystemHealthService } from "@/lib/platform/system-health";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const data = await new PlatformSystemHealthService().read(context);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlatformAuthenticationRequiredError) return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
    if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform permission denied" }, { status: 403 });
    return NextResponse.json({ error: "Platform system health could not be read" }, { status: 503 });
  }
}
