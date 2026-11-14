import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { issuePendingMfaChallenge } from "./mfa-challenge-token";
import { encryptTotpSecret } from "./mfa-totp-encryption";
import { completeMfaLoginInTransaction } from "./mfa-login-transaction";

const now = new Date("2026-11-13T12:00:00.000Z");
const secret = randomBytes(20);
const encryptionKeyBase64 = randomBytes(32).toString("base64");
const organizationId = "org-a", userId = "user-a";
const step = Math.floor(now.getTime() / 30000);
const counter = Buffer.alloc(8);
counter.writeBigUInt64BE(BigInt(step));
const digest = createHmac("sha1", secret).update(counter).digest();
const offset = digest[digest.length - 1] & 15;
const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
function setup() {
  const challengeToken = issuePendingMfaChallenge(now).token;
  const tx = {
    pendingMfaChallenge: {
      findUnique: vi.fn().mockResolvedValue({ organizationId, userId, consumedAt: null,
        expiresAt: new Date(now.getTime() + 300000), failedAttempts: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    mfaTotpFactor: {
      findUnique: vi.fn().mockResolvedValue({ id: "factor-a", organizationId, userId,
        encryptedSecret: encryptTotpSecret({ secret, organizationId, userId, keyVersion: "v1", encryptionKeyBase64 }),
        keyVersion: "v1", verifiedAt: now, disabledAt: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    authenticationEvent: { create: vi.fn().mockResolvedValue({ id: "event-a" }) },
    session: { create: vi.fn().mockResolvedValue({ id: "session-a" }) },
    user: { update: vi.fn().mockResolvedValue({ id: userId }) },
  };
  return { tx, input: { transaction: tx, challengeToken, organizationId, userId, code, now, encryptionKeyBase64 } };
}
describe("complete MFA login transaction", () => {
  it("reserves TOTP, consumes challenge and creates a session", async () => {
    const { tx, input } = setup();
    expect((await completeMfaLoginInTransaction(input))?.token).toHaveLength(43);
    expect(tx.mfaTotpFactor.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.pendingMfaChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.session.create).toHaveBeenCalledTimes(1);
  });
  it("records failed code attempts without issuing sessions", async () => {
    const { tx, input } = setup();
    expect(await completeMfaLoginInTransaction({ ...input, code: "not-a-code" })).toBeNull();
    expect(tx.pendingMfaChallenge.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId, userId, consumedAt: null }),
      data: { failedAttempts: { increment: 1 } },
    });
    expect(tx.session.create).not.toHaveBeenCalled();
  });
  it("rejects cross-tenant challenges before factor lookup", async () => {
    const { tx, input } = setup();
    tx.pendingMfaChallenge.findUnique.mockResolvedValueOnce({
      organizationId: "another-tenant", userId, consumedAt: null,
      expiresAt: new Date(now.getTime() + 300000), failedAttempts: 0,
    });
    expect(await completeMfaLoginInTransaction(input)).toBeNull();
    expect(tx.mfaTotpFactor.findUnique).not.toHaveBeenCalled();
  });
  it("rejects expired challenges before retrieving the factor", async () => {
    const { tx, input } = setup();
    tx.pendingMfaChallenge.findUnique.mockResolvedValueOnce({
      organizationId, userId, consumedAt: null, expiresAt: now, failedAttempts: 0,
    });
    expect(await completeMfaLoginInTransaction(input)).toBeNull();
    expect(tx.mfaTotpFactor.findUnique).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });
  it("rejects consumed challenges before retrieving the factor", async () => {
    const { tx, input } = setup();
    tx.pendingMfaChallenge.findUnique.mockResolvedValueOnce({
      organizationId, userId, consumedAt: now,
      expiresAt: new Date(now.getTime() + 300000), failedAttempts: 0,
    });
    expect(await completeMfaLoginInTransaction(input)).toBeNull();
    expect(tx.mfaTotpFactor.findUnique).not.toHaveBeenCalled();
  });
  it("rejects challenges after five failed codes", async () => {
    const { tx, input } = setup();
    tx.pendingMfaChallenge.findUnique.mockResolvedValueOnce({
      organizationId, userId, consumedAt: null,
      expiresAt: new Date(now.getTime() + 300000), failedAttempts: 5,
    });
    expect(await completeMfaLoginInTransaction(input)).toBeNull();
    expect(tx.mfaTotpFactor.findUnique).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });
  it("rejects a missing enrolled authenticator factor", async () => {
    const { tx, input } = setup();
    tx.mfaTotpFactor.findUnique.mockResolvedValueOnce(null);
    expect(await completeMfaLoginInTransaction(input)).toBeNull();
    expect(tx.pendingMfaChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });
  it("rejects a disabled authenticator without issuing a session", async () => {
    const { tx, input } = setup();
    // Replace the factor lookup with a disabled enrollment fixture.
    tx.mfaTotpFactor.findUnique.mockResolvedValueOnce({
      id: "factor-a", organizationId, userId, encryptedSecret: "unused",
      keyVersion: "v1", verifiedAt: now, disabledAt: now,
    });
    expect(await completeMfaLoginInTransaction(input)).toBeNull();
    expect(tx.session.create).not.toHaveBeenCalled();
    expect(tx.pendingMfaChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { failedAttempts: { increment: 1 } },
    }));
  });
  it("rejects a TOTP replay reservation conflict without issuing a session", async () => {
    const { tx, input } = setup();
    tx.mfaTotpFactor.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await completeMfaLoginInTransaction(input)).toBeNull();
    expect(tx.session.create).not.toHaveBeenCalled();
    expect(tx.pendingMfaChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { failedAttempts: { increment: 1 } },
    }));
  });
  it("throws on challenge consumption conflict to force transaction rollback", async () => {
    const { tx, input } = setup();
    tx.pendingMfaChallenge.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(completeMfaLoginInTransaction(input)).rejects.toThrow("MFA challenge consumption conflict");
    expect(tx.session.create).not.toHaveBeenCalled();
  });
});
