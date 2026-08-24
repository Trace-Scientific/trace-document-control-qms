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

  it("never extends idle expiration beyond the absolute limit", () => {
    const absolute = new Date("2026-08-24T12:10:00.000Z");
    expect(nextIdleExpiration(now, absolute, 30 * 60 * 1000)).toEqual(absolute);
  });
});
