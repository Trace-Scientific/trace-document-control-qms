// Pure MFA challenge policy. Persistence must atomically consume a challenge and
// increment attempts; this module alone does not authorize a login session.
export const MFA_CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

export interface PendingMfaChallenge {
  organizationId: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  failedAttempts: number;
}

export type MfaChallengeDecision =
  | { allowed: true }
  | { allowed: false; reason: "wrong_tenant" | "wrong_user" | "expired" | "consumed" | "attempts_exhausted" };

export function evaluateMfaChallenge(input: {
  challenge: PendingMfaChallenge;
  organizationId: string;
  userId: string;
  now: Date;
}): MfaChallengeDecision {
  const { challenge, organizationId, userId, now } = input;
  if (challenge.organizationId !== organizationId) return { allowed: false, reason: "wrong_tenant" };
  if (challenge.userId !== userId) return { allowed: false, reason: "wrong_user" };
  if (challenge.consumedAt !== null) return { allowed: false, reason: "consumed" };
  if (!Number.isSafeInteger(challenge.failedAttempts) || challenge.failedAttempts < 0 || challenge.failedAttempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
    return { allowed: false, reason: "attempts_exhausted" };
  }
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(challenge.expiresAt.getTime()) || challenge.expiresAt <= now) {
    return { allowed: false, reason: "expired" };
  }
  return { allowed: true };
}

export function mfaChallengeExpiresAt(issuedAt: Date): Date {
  if (!Number.isFinite(issuedAt.getTime())) throw new Error("Invalid MFA challenge issue time");
  return new Date(issuedAt.getTime() + MFA_CHALLENGE_LIFETIME_MS);
}
