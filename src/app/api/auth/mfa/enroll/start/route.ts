import { NextRequest, NextResponse } from "next/server";
import { isSameOriginAccountMutation } from "@/lib/security/account-mutation-origin";
import { z } from "zod";
import { db } from "@/lib/db";
import { prepareTotpEnrollment } from "@/lib/security/mfa-enrollment";
import { reauthenticateForMfaEnrollment } from "@/lib/security/mfa-enrollment-reauth";
import { storePendingTotpEnrollment, type PendingEnrollmentStore } from "@/lib/security/mfa-enrollment-recovery";

const schema = z.object({ password: z.string().min(1).max(1024) }).strict();

// This endpoint is deliberately disabled unless explicitly configured.
// Enrollment is only offered to an authenticated, password-reauthenticated
// account. Only expired, unverified, active pending factors may be restarted.
export async function POST(request: NextRequest) {
  if (!isSameOriginAccountMutation(request)) {
    return NextResponse.json({ error: "Request denied." }, { status: 403 });
  }
  if (process.env.QMS_MFA_ENROLLMENT_ENABLED !== "true") {
    return NextResponse.json({ error: "Enrollment is unavailable." }, { status: 503 });
  }
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const identity = await reauthenticateForMfaEnrollment(request, parsed.data.password);
    if (!identity) return NextResponse.json({ error: "Enrollment denied." }, { status: 403 });
    const encryptionKeyBase64 = process.env.QMS_MFA_TOTP_ENCRYPTION_KEY;
    if (!encryptionKeyBase64) return NextResponse.json({ error: "Enrollment is unavailable." }, { status: 503 });
    const user = await db.user.findUnique({
      where: { id: identity.userId },
      select: { email: true },
    });
    if (!user) return NextResponse.json({ error: "Enrollment denied." }, { status: 403 });
    const prepared = prepareTotpEnrollment({
      ...identity, accountLabel: user.email, encryptionKeyBase64, keyVersion: "v1",
    });
    const stored = await storePendingTotpEnrollment({
      store: db as unknown as PendingEnrollmentStore,
      ...identity, encryptedSecret: prepared.encryptedSecret,
      keyVersion: "v1", now: new Date(),
    });
    if (!stored) return NextResponse.json({ error: "Enrollment unavailable or already started." }, { status: 409 });
    const response = NextResponse.json({ data: { provisioningUri: prepared.provisioningUri } });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    // No secrets or internal errors in responses or logs.
    return NextResponse.json({ error: "Enrollment unavailable or already started." }, { status: 409 });
  }
}
