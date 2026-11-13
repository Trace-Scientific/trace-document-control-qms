import { describe, expect, it, vi } from "vitest";
import { issuePendingMfaChallenge } from "./mfa-challenge-token";
import { createVerifiedMfaSession } from "./mfa-session-transaction";

const now = new Date("2026-11-13T12:00:00.000Z");
function setup(consumedCount = 1) {
  const tx = {
    pendingMfaChallenge: { updateMany: vi.fn().mockResolvedValue({ count: consumedCount }) },
    authenticationEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    session: { create: vi.fn().mockResolvedValue({ id: "session-1" }) },
    user: { update: vi.fn().mockResolvedValue({ id: "user-a" }) },
  };
  return { tx, input: {
    transaction: tx, challengeToken: issuePendingMfaChallenge(now).token,
    organizationId: "org-a", userId: "user-a", now, factorVerified: true,
  } };
}
describe("verified MFA session transaction", () => {
  it("consumes a valid challenge before creating an MFA-attributed session", async () => {
    const { tx, input } = setup();
    const result = await createVerifiedMfaSession(input);
    expect(result?.token).toHaveLength(43);
    expect(result?.absoluteExpiresAt).toEqual(new Date("2026-11-14T00:00:00.000Z"));
    expect(tx.pendingMfaChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.authenticationEvent.create).toHaveBeenCalledWith({
      data: { organizationId: "org-a", userId: "user-a", eventType: "LOGIN",
        outcome: "SUCCESS", method: "MFA", occurredAt: now,
        validUntil: new Date("2026-11-14T00:00:00.000Z") },
    });
    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-a", userId: "user-a", authenticationEventId: "event-1",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        idleExpiresAt: new Date("2026-11-13T12:30:00.000Z"),
      }),
    });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-a" }, data: { lastLoginAt: now } });
  });
  it("does not consume challenges or create sessions without factor verification", async () => {
    const { tx, input } = setup();
    expect(await createVerifiedMfaSession({ ...input, factorVerified: false })).toBeNull();
    expect(tx.pendingMfaChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });
  it("does not create sessions when the challenge is missing, expired or already used", async () => {
    const { tx, input } = setup(0);
    expect(await createVerifiedMfaSession(input)).toBeNull();
    expect(tx.authenticationEvent.create).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });
  it("propagates session storage errors so the outer transaction can roll back challenge consumption", async () => {
    const { tx, input } = setup();
    tx.session.create.mockRejectedValueOnce(new Error("storage failure"));
    await expect(createVerifiedMfaSession(input)).rejects.toThrow("storage failure");
    expect(tx.pendingMfaChallenge.updateMany).toHaveBeenCalledTimes(1);
  });
});
