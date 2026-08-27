import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/security/crypto";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("qms_session")?.value;
  if (token) {
    const session = await db.session.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    if (session && !session.revokedAt) {
      const now = new Date();
      await db.$transaction([
        db.session.update({ where: { id: session.id }, data: { revokedAt: now, revokedByUserId: session.userId, revocationReason: "User logout" } }),
        db.authenticationEvent.create({ data: { organizationId: session.organizationId, userId: session.userId, eventType: "LOGOUT", outcome: "SUCCESS", method: "PASSWORD", occurredAt: now } }),
      ]);
    }
  }
  const response = NextResponse.json({ data: { loggedOut: true } });
  response.cookies.set("qms_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}

