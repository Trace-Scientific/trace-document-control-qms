import { generateOpaqueToken, hashOpaqueToken, opaqueTokenMatches } from "./crypto";
import { mfaChallengeExpiresAt } from "./mfa-challenge-policy";

// This issues a bearer secret for a pending MFA challenge, NOT a QMS session.
// Callers must persist only tokenHash, enforce tenant binding, and atomically
// consume the challenge after successful factor verification.
export function issuePendingMfaChallenge(issuedAt: Date = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = generateOpaqueToken();
  return { token, tokenHash: hashOpaqueToken(token), expiresAt: mfaChallengeExpiresAt(issuedAt) };
}

export function pendingMfaTokenMatches(token: string, expectedHash: string): boolean {
  if (typeof token !== "string" || token.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  return opaqueTokenMatches(token, expectedHash);
}
