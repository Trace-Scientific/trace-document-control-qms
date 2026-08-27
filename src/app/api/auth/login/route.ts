import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login, LoginRejectedError } from "@/lib/security/login";

const inputSchema = z.object({
  organizationCode: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{2,49}$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
});
const fingerprint = (value: string | null) => value ? createHash("sha256").update(value).digest("hex") : undefined;

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await request.json());
    const result = await login({
      ...input,
      ipAddressHash: fingerprint(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null),
      userAgentHash: fingerprint(request.headers.get("user-agent")),
    });
    const response = NextResponse.json({ data: { user: result.user } });
    response.cookies.set("qms_session", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: result.absoluteExpiresAt,
    });
    return response;
  } catch (error) {
    const throttled = error instanceof LoginRejectedError && error.throttled;
    return NextResponse.json(
      { error: throttled ? "Too many sign-in attempts. Try again later." : "Sign-in failed." },
      { status: throttled ? 429 : 401 },
    );
  }
}

