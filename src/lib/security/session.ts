import { opaqueTokenMatches } from "./crypto";

export interface SessionRecord {
  id: string;
  organizationId: string;
  userId: string;
  tokenHash: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export type SessionValidation =
  | { valid: true; session: SessionRecord }
  | {
      valid: false;
      reason: "malformed_token" | "token_mismatch" | "revoked" | "idle_expired" | "absolute_expired";
    };

export function validateSession(
  token: string,
  session: SessionRecord,
  now = new Date(),
): SessionValidation {
  if (!token || token.length > 512) return { valid: false, reason: "malformed_token" };
  if (!opaqueTokenMatches(token, session.tokenHash)) {
    return { valid: false, reason: "token_mismatch" };
  }
  if (session.revokedAt) return { valid: false, reason: "revoked" };
  if (session.absoluteExpiresAt <= now) {
    return { valid: false, reason: "absolute_expired" };
  }
  if (session.idleExpiresAt <= now) return { valid: false, reason: "idle_expired" };
  return { valid: true, session };
}

export function nextIdleExpiration(
  now: Date,
  absoluteExpiresAt: Date,
  idleTimeoutMs: number,
): Date {
  if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs <= 0) {
    throw new Error("Idle timeout must be a positive integer");
  }
  const candidate = new Date(now.getTime() + idleTimeoutMs);
  return candidate < absoluteExpiresAt ? candidate : absoluteExpiresAt;
}
