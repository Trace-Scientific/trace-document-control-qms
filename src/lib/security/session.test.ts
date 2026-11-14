import { describe, expect, it } from "vitest";
import { hashOpaqueToken } from "./crypto";
import { nextIdleExpiration, validateSession, type SessionRecord } from "./session";

const now = new Date("2026-08-24T12:00:00.000Z");

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    organizationId: "org-1",
    userId: "user-1",
    tokenHash: hashOpaqueToken("secret-token"),
    idleExpiresAt: new Date("2026-08-24T12:30:00.000Z"),
    absoluteExpiresAt: new Date("2026-08-25T12:00:00.000Z"),
    revokedAt: null,
    ...overrides,
  };
}

describe("session validation", () => {
  it("accepts an active matching session", () => {
    expect(validateSession("secret-token", session(), now).valid).toBe(true);
  });

  it.each([
    ["wrong token", "other-token", session(), "token_mismatch"],
    ["revoked session", "secret-token", session({ revokedAt: now }), "revoked"],
    ["idle timeout", "secret-token", session({ idleExpiresAt: now }), "idle_expired"],
    ["absolute timeout", "secret-token", session({ absoluteExpiresAt: now }), "absolute_expired"],
  ])("rejects %s", (_label, token, record, reason) => {
    expect(validateSession(token, record, now)).toEqual({ valid: false, reason });
  });

  it.each([
    ["empty token", ""],
    ["oversized token", "x".repeat(513)],
  ])("rejects a malformed %s before session acceptance", (_label, token) => {
    expect(validateSession(token, session(), now)).toEqual({ valid: false, reason: "malformed_token" });
  });

  it("rejects expired sessions even when the token matches and the other expiration remains valid", () => {
    expect(validateSession("secret-token", session({
      absoluteExpiresAt: new Date("2026-08-24T11:59:59.000Z"),
      idleExpiresAt: new Date("2026-08-24T12:30:00.000Z"),
    }), now)).toEqual({ valid: false, reason: "absolute_expired" });
  });

  it("rejects invalid idle timeout durations", () => {
    const absolute = new Date("2026-08-25T12:00:00.000Z");
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(() => nextIdleExpiration(now, absolute, duration)).toThrow("Idle timeout must be a positive integer");
    }
  });

  it("extends idle expiration only within the absolute limit", () => {
    const absolute = new Date("2026-08-25T12:00:00.000Z");
    expect(nextIdleExpiration(now, absolute, 30 * 60 * 1000)).toEqual(new Date("2026-08-24T12:30:00.000Z"));
  });

  it("never extends idle expiration beyond the absolute limit", () => {
    const absolute = new Date("2026-08-24T12:10:00.000Z");
    expect(nextIdleExpiration(now, absolute, 30 * 60 * 1000)).toEqual(absolute);
  });
});
