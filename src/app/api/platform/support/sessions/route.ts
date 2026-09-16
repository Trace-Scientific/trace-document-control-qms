import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSupportAccessError } from "@/lib/platform/support-access-api";
import { SUPPORT_SESSION_COOKIE, SupportAccessService } from "@/lib/platform/support-access";

const service = new SupportAccessService();
const issueSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().max(1000),
});
const exitSchema = z.object({ reason: z.string().max(1000) });

export async function GET(request: NextRequest) {
  try {
    const platform = await authenticatePlatformRequest(request);
    const support = await service.authenticateSession(platform, request.cookies.get(SUPPORT_SESSION_COOKIE)?.value);
    return NextResponse.json({ data: support });
  } catch (error) {
    return respondSupportAccessError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const platform = await authenticatePlatformRequest(request);
    const input = issueSchema.parse(await request.json());
    const issued = await service.issueAndAssumeSession(platform, input);
    const response = NextResponse.json({ data: issued.session }, { status: 201 });
    response.cookies.set(SUPPORT_SESSION_COOKIE, issued.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: issued.session.expiresAt,
    });
    return response;
  } catch (error) {
    return respondSupportAccessError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const platform = await authenticatePlatformRequest(request);
    const input = exitSchema.parse(await request.json());
    await service.exitSession(platform, request.cookies.get(SUPPORT_SESSION_COOKIE)?.value, input.reason);
    const response = NextResponse.json({ data: { exited: true } });
    response.cookies.set(SUPPORT_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    return respondSupportAccessError(error);
  }
}
