import { describe, expect, it } from "vitest";
import { evaluateMfaChallenge, mfaChallengeExpiresAt, MFA_CHALLENGE_MAX_ATTEMPTS, type PendingMfaChallenge } from "./mfa-challenge-policy";

const now = new Date("2026-11-13T12:00:00.000Z");
const base: PendingMfaChallenge = { organizationId: "org-a", userId: "user-a", expiresAt: new Date(now.getTime() + 60_000), consumedAt: null, failedAttempts: 0 };
const check = (challenge = base, organizationId = "org-a", userId = "user-a") =>
  evaluateMfaChallenge({ challenge, organizationId, userId, now });

describe("MFA challenge eligibility policy", () => {
  it("accepts an unconsumed, unexpired tenant-bound challenge", () => {
    expect(check()).toEqual({ allowed: true });
    expect(mfaChallengeExpiresAt(now)).toEqual(new Date(now.getTime() + 300_000));
  });
  it("rejects cross-tenant and cross-user challenges", () => {
    expect(check(base, "org-b")).toEqual({ allowed: false, reason: "wrong_tenant" });
    expect(check(base, "org-a", "user-b")).toEqual({ allowed: false, reason: "wrong_user" });
  });
  it("rejects consumed and expired challenges, including exact expiry", () => {
    expect(check({ ...base, consumedAt: now })).toEqual({ allowed: false, reason: "consumed" });
    expect(check({ ...base, expiresAt: now })).toEqual({ allowed: false, reason: "expired" });
    expect(check({ ...base, expiresAt: new Date(now.getTime() - 1) })).toEqual({ allowed: false, reason: "expired" });
  });
  it("rejects exhausted or invalid attempt counts", () => {
    for (const failedAttempts of [MFA_CHALLENGE_MAX_ATTEMPTS, -1, 1.5, Number.NaN]) {
      expect(check({ ...base, failedAttempts })).toEqual({ allowed: false, reason: "attempts_exhausted" });
    }
  });
});
