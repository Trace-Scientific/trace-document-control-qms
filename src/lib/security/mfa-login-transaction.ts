import { hashOpaqueToken } from "./crypto";
import { pendingMfaTokenMatches } from "./mfa-challenge-token";
import { MFA_CHALLENGE_MAX_ATTEMPTS } from "./mfa-challenge-policy";
import { createVerifiedMfaSession, type VerifiedMfaSessionTransaction } from "./mfa-session-transaction";
import { verifyAndReserveTotpStep, type TotpReplayStore } from "./mfa-totp-replay";

// Run this entire operation inside one serializable database transaction.
// The caller must retry serialization conflicts at the transaction boundary.
export interface MfaLoginTransaction extends VerifiedMfaSessionTransaction, TotpReplayStore {
  pendingMfaChallenge: VerifiedMfaSessionTransaction["pendingMfaChallenge"] & {
    findUnique(args: { where: { tokenHash: string } }): Promise<{
      organizationId: string; userId: string; consumedAt: Date | null;
      expiresAt: Date; failedAttempts: number;
    } | null>;
    updateMany(args: {
      where: { tokenHash: string; organizationId: string; userId: string;
        consumedAt: null; expiresAt: { gt: Date }; failedAttempts: { lt: number } };
      data: { failedAttempts: { increment: number } };
    }): Promise<{ count: number }>;
  };
  mfaTotpFactor: TotpReplayStore["mfaTotpFactor"] & {
    findUnique(args: { where: { organizationId_userId: {
      organizationId: string; userId: string;
    } } }): Promise<{
      id: string; organizationId: string; userId: string; encryptedSecret: string;
      keyVersion: string; verifiedAt: Date | null; disabledAt: Date | null;
    } | null>;
  };
}

export async function completeMfaLoginInTransaction(input: {
  transaction: MfaLoginTransaction; challengeToken: string;
  organizationId: string; userId: string; code: string; now: Date;
  encryptionKeyBase64: string;
}): Promise<{ token: string; absoluteExpiresAt: Date } | null> {
  const { transaction, challengeToken, organizationId, userId, code, now, encryptionKeyBase64 } = input;
  if (!organizationId || !userId || !Number.isFinite(now.getTime()) ||
      typeof challengeToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challengeToken)) return null;
  const tokenHash = hashOpaqueToken(challengeToken);
  if (!pendingMfaTokenMatches(challengeToken, tokenHash)) return null;
  const challenge = await transaction.pendingMfaChallenge.findUnique({ where: { tokenHash } });
  if (!challenge || challenge.organizationId !== organizationId || challenge.userId !== userId ||
      challenge.consumedAt !== null || challenge.expiresAt <= now ||
      challenge.failedAttempts >= MFA_CHALLENGE_MAX_ATTEMPTS || challenge.failedAttempts < 0) return null;
  const factor = await transaction.mfaTotpFactor.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!factor) return null;
  const verified = await verifyAndReserveTotpStep({
    store: transaction, factor, organizationId, userId, code, now, encryptionKeyBase64,
  });
  if (!verified) {
    await transaction.pendingMfaChallenge.updateMany({
      where: {
        tokenHash, organizationId, userId, consumedAt: null,
        expiresAt: { gt: now }, failedAttempts: { lt: MFA_CHALLENGE_MAX_ATTEMPTS },
      },
      data: { failedAttempts: { increment: 1 } },
    });
    return null;
  }
  const session = await createVerifiedMfaSession({
    transaction, challengeToken, organizationId, userId, now, factorVerified: true,
  });
  // If challenge consumption lost a race, abort the transaction so the TOTP
  // replay reservation cannot be committed independently.
  if (!session) throw new Error("MFA challenge consumption conflict");
  return session;
}
