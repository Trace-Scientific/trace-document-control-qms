import { describe, expect, it, vi } from "vitest";
import { hashOpaqueToken } from "./crypto";
import { startMfaChallenge } from "./mfa-challenge-issuance";

const now = new Date("2026-11-13T12:00:00.000Z");
function setup() {
  const transaction = {
    pendingMfaChallenge: { create: vi.fn().mockResolvedValue({ id: "challenge-1" }) },
    authenticationEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
  };
  return { transaction, input: { transaction, organizationId: "org-a", userId: "user-a", now } };
}
describe("MFA challenge issuance", () => {
  it("persists only a hashed bearer token and an attributable challenge event", async () => {
    const { transaction, input } = setup();
    const result = await startMfaChallenge(input);
    expect(result.challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toEqual(new Date("2026-11-13T12:05:00.000Z"));
    expect(transaction.pendingMfaChallenge.create).toHaveBeenCalledWith({
      data: { organizationId: "org-a", userId: "user-a",
        tokenHash: hashOpaqueToken(result.challengeToken), issuedAt: now,
        expiresAt: result.expiresAt },
    });
    expect(transaction.authenticationEvent.create).toHaveBeenCalledWith({
      data: { organizationId: "org-a", userId: "user-a",
        eventType: "MFA_CHALLENGE", outcome: "SUCCESS",
        method: "PASSWORD", occurredAt: now, validUntil: result.expiresAt },
    });
    expect(JSON.stringify(transaction.pendingMfaChallenge.create.mock.calls)).not.toContain(result.challengeToken);
  });
  it("rejects missing tenant or user context before database writes", async () => {
    const { transaction, input } = setup();
    await expect(startMfaChallenge({ ...input, organizationId: "" })).rejects.toThrow();
    await expect(startMfaChallenge({ ...input, userId: "" })).rejects.toThrow();
    expect(transaction.pendingMfaChallenge.create).not.toHaveBeenCalled();
  });
  it("propagates audit write failures so the caller's transaction can roll back", async () => {
    const { transaction, input } = setup();
    transaction.authenticationEvent.create.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(startMfaChallenge(input)).rejects.toThrow("audit unavailable");
  });
});
