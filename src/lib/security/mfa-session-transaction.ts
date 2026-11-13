import { generateOpaqueToken, hashOpaqueToken } from "./crypto";
import { consumeVerifiedMfaChallenge, type MfaChallengeUpdateStore } from "./mfa-challenge-consumption";

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

// Internal transactional building block only. The caller must first verify an
// enrolled factor and ensure the user and organization remain active. Do not
// expose this function directly as an API or accept a client-provided verified flag.
export interface VerifiedMfaSessionTransaction extends MfaChallengeUpdateStore {
  authenticationEvent: {
    create(args: { data: {
      organizationId: string; userId: string; eventType: "LOGIN"; outcome: "SUCCESS";
      method: "MFA"; occurredAt: Date; validUntil: Date;
    } }): Promise<{ id: string }>;
  };
  session: {
    create(args: { data: {
      organizationId: string; userId: string; authenticationEventId: string;
      tokenHash: string; createdAt: Date; lastSeenAt: Date;
      idleExpiresAt: Date; absoluteExpiresAt: Date;
    } }): Promise<unknown>;
  };
  user: { update(args: { where: { id: string }; data: { lastLoginAt: Date } }): Promise<unknown> };
}

export async function createVerifiedMfaSession(input: {
  transaction: VerifiedMfaSessionTransaction;
  challengeToken: string;
  organizationId: string;
  userId: string;
  now: Date;
  factorVerified: boolean;
}): Promise<{ token: string; absoluteExpiresAt: Date } | null> {
  const { transaction, challengeToken, organizationId, userId, now, factorVerified } = input;
  if (!factorVerified) return null;
  const consumed = await consumeVerifiedMfaChallenge({
    store: transaction, token: challengeToken, organizationId, userId,
    now, secondFactorVerified: true,
  });
  if (!consumed) return null;
  const token = generateOpaqueToken();
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  const event = await transaction.authenticationEvent.create({
    data: { organizationId, userId, eventType: "LOGIN", outcome: "SUCCESS",
      method: "MFA", occurredAt: now, validUntil: absoluteExpiresAt },
  });
  await transaction.session.create({
    data: { organizationId, userId, authenticationEventId: event.id,
      tokenHash: hashOpaqueToken(token), createdAt: now, lastSeenAt: now,
      idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt },
  });
  await transaction.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
  return { token, absoluteExpiresAt };
}
