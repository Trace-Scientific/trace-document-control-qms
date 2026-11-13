import { describe, expect, it, vi } from "vitest";
import { hashOpaqueToken } from "./crypto";
import { issuePendingMfaChallenge } from "./mfa-challenge-token";
import { consumeVerifiedMfaChallenge } from "./mfa-challenge-consumption";

const now = new Date("2026-11-13T12:00:00.000Z");
function setup(count = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  const token = issuePendingMfaChallenge(now).token;
  const input = {
    store: { pendingMfaChallenge: { updateMany } },
    token,
    organizationId: "org-a",
    userId: "user-a",
    now,
    secondFactorVerified: true,
  };
  return { input, updateMany };
}
describe("atomic MFA challenge consumption", () => {
  it("uses a single conditional update with tenant, user, expiry and attempt guards", async () => {
    const { input, updateMany } = setup();
    expect(await consumeVerifiedMfaChallenge(input)).toBe(true);
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        tokenHash: hashOpaqueToken(input.token),
        organizationId: "org-a",
        userId: "user-a",
        consumedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: 5 },
      },
      data: { consumedAt: now },
    });
  });
  it("rejects a missing or already-consumed challenge", async () => {
    const { input } = setup(0);
    expect(await consumeVerifiedMfaChallenge(input)).toBe(false);
  });
  it("never touches persistence without verified second factor or valid bearer token", async () => {
    const { input, updateMany } = setup();
    expect(await consumeVerifiedMfaChallenge({ ...input, secondFactorVerified: false })).toBe(false);
    expect(await consumeVerifiedMfaChallenge({ ...input, token: "bad" })).toBe(false);
    expect(await consumeVerifiedMfaChallenge({ ...input, organizationId: "" })).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
