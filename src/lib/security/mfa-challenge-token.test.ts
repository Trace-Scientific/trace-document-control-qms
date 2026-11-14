import { describe, expect, it } from "vitest";
import { issuePendingMfaChallenge, pendingMfaTokenMatches } from "./mfa-challenge-token";

describe("pending MFA challenge bearer tokens", () => {
  it("issues a random secret with only its hash intended for persistence", () => {
    const a = issuePendingMfaChallenge(new Date("2026-11-13T12:00:00.000Z"));
    const b = issuePendingMfaChallenge(new Date("2026-11-13T12:00:00.000Z"));
    expect(a.token).toHaveLength(43);
    expect(a.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
    expect(a.expiresAt).toEqual(new Date("2026-11-13T12:05:00.000Z"));
    expect(pendingMfaTokenMatches(a.token, a.tokenHash)).toBe(true);
    expect(pendingMfaTokenMatches(b.token, a.tokenHash)).toBe(false);
  });
  it("rejects malformed tokens and hashes", () => {
    const issued = issuePendingMfaChallenge();
    for (const token of ["", "bad", "a".repeat(513), "x".repeat(42) + "="]) {
      expect(pendingMfaTokenMatches(token, issued.tokenHash)).toBe(false);
    }
    expect(pendingMfaTokenMatches(issued.token, "invalid")).toBe(false);
  });
  it("rejects invalid issue times", () => {
    expect(() => issuePendingMfaChallenge(new Date(Number.NaN))).toThrow("Invalid MFA challenge issue time");
  });
});
