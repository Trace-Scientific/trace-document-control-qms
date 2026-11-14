import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyMfaLogin } from "@/lib/security/mfa-login-service";

const inputSchema = z.object({
  challengeToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().regex(/^\d{6}$/),
}).strict();

// MFA challenge responses must not be cached by browsers or intermediaries.
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return noStore(NextResponse.json({ error: "Verification failed." }, { status: 401 }));
    const result = await verifyMfaLogin(parsed.data);
    if (!result) return noStore(NextResponse.json({ error: "Verification failed." }, { status: 401 }));
    const response = NextResponse.json({ data: { verified: true } });
    response.cookies.set("qms_session", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: result.absoluteExpiresAt,
    });
    return noStore(response);
  } catch {
    return noStore(NextResponse.json({ error: "Verification unavailable." }, { status: 503 }));
  }
}
