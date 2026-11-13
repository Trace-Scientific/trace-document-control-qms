import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isSameOriginAccountMutation } from "@/lib/security/account-mutation-origin";
import { z } from "zod";
import { db } from "@/lib/db";
import { confirmTotpEnrollmentInTransaction, type EnrollmentConfirmationTransaction } from "@/lib/security/mfa-enrollment-confirmation";
import { reauthenticateForMfaEnrollment } from "@/lib/security/mfa-enrollment-reauth";

const schema = z.object({
  password: z.string().min(1).max(1024),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountMutation(request)) {
    return NextResponse.json({ error: "Request denied." }, { status: 403 });
  }
  if (process.env.QMS_MFA_ENROLLMENT_ENABLED !== "true") {
    return NextResponse.json({ error: "Enrollment is unavailable." }, { status: 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const identity = await reauthenticateForMfaEnrollment(request, parsed.data.password);
    if (!identity) return NextResponse.json({ error: "Enrollment denied." }, { status: 403 });
    const encryptionKeyBase64 = process.env.QMS_MFA_TOTP_ENCRYPTION_KEY;
    if (!encryptionKeyBase64) return NextResponse.json({ error: "Enrollment is unavailable." }, { status: 503 });
    const confirmed = await db.$transaction(async (transaction) =>
      confirmTotpEnrollmentInTransaction({
        transaction: transaction as unknown as EnrollmentConfirmationTransaction,
        ...identity, code: parsed.data.code, now: new Date(), encryptionKeyBase64,
      }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!confirmed) return NextResponse.json({ error: "Verification failed." }, { status: 401 });
    const response = NextResponse.json({ data: { mfaEnabled: true } });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Verification unavailable." }, { status: 503 });
  }
}
