import { issuePendingMfaChallenge } from "./mfa-challenge-token";

// Call only after password verification and confirmation that an enrolled,
// active TOTP factor exists. This creates NO authenticated session.
export interface PendingMfaChallengeStore {
  pendingMfaChallenge: {
    create(args: { data: {
      organizationId: string; userId: string; tokenHash: string;
      issuedAt: Date; expiresAt: Date;
    } }): Promise<unknown>;
  };
  authenticationEvent: {
    create(args: { data: {
      organizationId: string; userId: string; eventType: "MFA_CHALLENGE";
      outcome: "SUCCESS"; method: "PASSWORD"; occurredAt: Date;
      validUntil: Date;
    } }): Promise<unknown>;
  };
}

export async function startMfaChallenge(input: {
  transaction: PendingMfaChallengeStore;
  organizationId: string;
  userId: string;
  now: Date;
}): Promise<{ challengeToken: string; expiresAt: Date }> {
  const { transaction, organizationId, userId, now } = input;
  if (!organizationId || !userId || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid MFA challenge context");
  }
  const challenge = issuePendingMfaChallenge(now);
  await transaction.pendingMfaChallenge.create({
    data: { organizationId, userId, tokenHash: challenge.tokenHash,
      issuedAt: now, expiresAt: challenge.expiresAt },
  });
  await transaction.authenticationEvent.create({
    data: { organizationId, userId, eventType: "MFA_CHALLENGE",
      outcome: "SUCCESS", method: "PASSWORD", occurredAt: now,
      validUntil: challenge.expiresAt },
  });
  return { challengeToken: challenge.token, expiresAt: challenge.expiresAt };
}
