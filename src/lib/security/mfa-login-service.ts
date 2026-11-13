import { Prisma } from "@prisma/client";
import { db } from "../db";
import { hashOpaqueToken } from "./crypto";
import { completeMfaLoginInTransaction, type MfaLoginTransaction } from "./mfa-login-transaction";

const MAX_SERIALIZATION_RETRIES = 2;

// Server-only entry point. Tenant and user identities are resolved from the
// server-stored challenge, never supplied by the browser.
export async function verifyMfaLogin(input: {
  challengeToken: string; code: string; now?: Date;
}): Promise<{ token: string; absoluteExpiresAt: Date } | null> {
  const { challengeToken, code } = input;
  const now = input.now ?? new Date();
  if (!/^[A-Za-z0-9_-]{43}$/.test(challengeToken) ||
      !/^\d{6}$/.test(code) || !Number.isFinite(now.getTime())) return null;
  const encryptionKeyBase64 = process.env.QMS_MFA_TOTP_ENCRYPTION_KEY;
  if (!encryptionKeyBase64) throw new Error("MFA encryption key is not configured");

  for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      return await db.$transaction(async (transaction) => {
        const challenge = await transaction.pendingMfaChallenge.findUnique({
          where: { tokenHash: hashOpaqueToken(challengeToken) },
        });
        if (!challenge || challenge.consumedAt || challenge.expiresAt <= now ||
            challenge.failedAttempts >= 5) return null;
        const user = await transaction.user.findUnique({
          where: { id: challenge.userId },
          select: { id: true, organizationId: true, status: true, mfaEnabled: true,
            organization: { select: { active: true } } },
        });
        if (!user || user.organizationId !== challenge.organizationId ||
            user.status !== "ACTIVE" || !user.mfaEnabled || !user.organization.active) return null;
        return completeMfaLoginInTransaction({
          transaction: transaction as unknown as MfaLoginTransaction,
          challengeToken, organizationId: challenge.organizationId,
          userId: challenge.userId, code, now, encryptionKeyBase64,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" && attempt < MAX_SERIALIZATION_RETRIES) continue;
      throw error;
    }
  }
  return null;
}
