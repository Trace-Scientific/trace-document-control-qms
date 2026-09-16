import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest, PlatformAuthenticationRequiredError } from "@/lib/platform/authenticated-request";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({
      platformIdentityId: context.platformIdentityId,
      platformMembershipId: context.platformMembershipId,
      permissions: context.grants,
    });
  } catch (error) {
    if (error instanceof PlatformAuthenticationRequiredError) {
      return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "Platform context unavailable" }, { status: 500 });
  }
}
