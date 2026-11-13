import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encryptTotpSecret } from "./mfa-totp-encryption";
import { confirmTotpEnrollmentInTransaction } from "./mfa-enrollment-confirmation";

const organizationId = "org-a", userId = "user-a";
const now = new Date("2026-11-13T12:00:00.000Z");
const secret = randomBytes(20);
const encryptionKeyBase64 = randomBytes(32).toString("base64");
const counter = Buffer.alloc(8);
counter.writeBigUInt64BE(BigInt(Math.floor(now.getTime() / 30000)));
const digest = createHmac("sha1", secret).update(counter).digest();
const offset = digest[digest.length - 1] & 15;
const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
function setup() {
  const transaction = {
    mfaTotpFactor: {
      findUnique: vi.fn().mockResolvedValue({
        id: "factor-a", organizationId, userId,
        encryptedSecret: encryptTotpSecret({
          secret, organizationId, userId, keyVersion: "v1", encryptionKeyBase64,
        }),
        keyVersion: "v1", enrolledAt: new Date(now.getTime() - 60_000), verifiedAt: null, disabledAt: null, enrollmentFailedAttempts: 0,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return { transaction, input: { transaction, organizationId, userId, code, now, encryptionKeyBase64 } };
}
describe("TOTP enrollment confirmation", () => {
  it("verifies the code, reserves its step, and enables MFA atomically", async () => {
    const { transaction, input } = setup();
    expect(await confirmTotpEnrollmentInTransaction(input)).toBe(true);
    expect(transaction.mfaTotpFactor.updateMany).toHaveBeenCalledWith({
      where: { id: "factor-a", organizationId, userId, verifiedAt: null, disabledAt: null,
        enrolledAt: { gte: new Date(now.getTime() - 600_000), lte: now },
        enrollmentFailedAttempts: { lt: 5 } },
      data: { verifiedAt: now, lastUsedStep: BigInt(Math.floor(now.getTime() / 30000)) },
    });
    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, organizationId, status: "ACTIVE", mfaEnabled: false },
      data: { mfaEnabled: true },
    });
  });
  it("does not enable MFA for an incorrect code", async () => {
    const { transaction, input } = setup();
    expect(await confirmTotpEnrollmentInTransaction({ ...input, code: "wrong" })).toBe(false);
    expect(transaction.mfaTotpFactor.updateMany).not.toHaveBeenCalled();
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects already verified and disabled factors", async () => {
    const { transaction, input } = setup();
    transaction.mfaTotpFactor.findUnique.mockResolvedValueOnce({
      ...(await transaction.mfaTotpFactor.findUnique({ where: { organizationId_userId: { organizationId, userId } } })),
      verifiedAt: now,
    });
    expect(await confirmTotpEnrollmentInTransaction(input)).toBe(false);
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects expired pending enrollment without activating MFA", async () => {
    const { transaction, input } = setup();
    const factor = await transaction.mfaTotpFactor.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
    transaction.mfaTotpFactor.findUnique.mockResolvedValueOnce({
      ...factor, enrolledAt: new Date(now.getTime() - 600_001),
    });
    expect(await confirmTotpEnrollmentInTransaction(input)).toBe(false);
    expect(transaction.mfaTotpFactor.updateMany).not.toHaveBeenCalled();
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a factor with a future enrollment timestamp", async () => {
    const { transaction, input } = setup();
    const factor = await transaction.mfaTotpFactor.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
    transaction.mfaTotpFactor.findUnique.mockResolvedValueOnce({
      ...factor, enrolledAt: new Date(now.getTime() + 1),
    });
    expect(await confirmTotpEnrollmentInTransaction(input)).toBe(false);
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a factor locked after five failed enrollment codes", async () => {
    const { transaction, input } = setup();
    const factor = await transaction.mfaTotpFactor.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
    transaction.mfaTotpFactor.findUnique.mockResolvedValueOnce({ ...factor, enrollmentFailedAttempts: 5 });
    expect(await confirmTotpEnrollmentInTransaction(input)).toBe(false);
    expect(transaction.mfaTotpFactor.updateMany).not.toHaveBeenCalled();
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it("increments failed enrollment attempts for a wrong six-digit code", async () => {
    const { transaction, input } = setup();
    const wrong = code === "000000" ? "999999" : "000000";
    expect(await confirmTotpEnrollmentInTransaction({ ...input, code: wrong })).toBe(false);
    expect(transaction.mfaTotpFactor.update).toHaveBeenCalledWith({
      where: { id: "factor-a" },
      data: { enrollmentFailedAttempts: { increment: 1 } },
    });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it("throws to roll back factor activation if account activation conflicts", async () => {
    const { transaction, input } = setup();
    transaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(confirmTotpEnrollmentInTransaction(input)).rejects.toThrow("MFA enrollment activation conflict");
  });
  it("does not enable MFA if the factor reservation loses a race", async () => {
    const { transaction, input } = setup();
    transaction.mfaTotpFactor.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await confirmTotpEnrollmentInTransaction(input)).toBe(false);
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
});
