import { hashOpaqueToken } from "./crypto";
import { MFA_CHALLENGE_MAX_ATTEMPTS } from "./mfa-challenge-policy";
import { pendingMfaTokenMatches } from "./mfa-challenge-token";

// A successful compare-and-swap consumes exactly one challenge. The caller must
// validate the second factor first and later create a session in the SAME
// database transaction; this helper deliberately does not issue sessions.
export interface MfaChallengeUpdateStore {
  pendingMfaChallenge: {
    updateMany(args: {
      where: {
        tokenHash: string;
        organizationId: string;
        userId: string;
        consumedAt: null;
        expiresAt: { gt: Date };
        failedAttempts: { lt: number };
      };
      data: { consumedAt: Date };
    }): Promise<{ count: number }>;
  };
}

export async function consumeVerifiedMfaChallenge(input: {
  store: MfaChallengeUpdateStore;
  token: string;
  organizationId: string;
  userId: string;
  now: Date;
  secondFactorVerified: boolean;
}): Promise<boolean> {
  const { store, token, organizationId, userId, now, secondFactorVerified } = input;
  if (!secondFactorVerified || !Number.isFinite(now.getTime()) || !organizationId || !userId) return false;
  // Validate the bearer token's syntax before deriving its lookup hash.
  if (!pendingMfaTokenMatches(token, hashOpaqueToken(token))) return false;
  const result = await store.pendingMfaChallenge.updateMany({
    where: {
      tokenHash: hashOpaqueToken(token),
      organizationId,
      userId,
      consumedAt: null,
      expiresAt: { gt: now },
      failedAttempts: { lt: MFA_CHALLENGE_MAX_ATTEMPTS },
    },
    data: { consumedAt: now },
  });
  return result.count === 1;
}
