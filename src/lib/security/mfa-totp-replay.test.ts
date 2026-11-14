import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encryptTotpSecret } from "./mfa-totp-encryption";
import { verifyAndReserveTotpStep } from "./mfa-totp-replay";

const now = new Date("2026-11-13T12:00:00.000Z");
const encryptionKeyBase64 = randomBytes(32).toString("base64");
const secret = randomBytes(20);
const context = { organizationId: "org-a", userId: "user-a", keyVersion: "v1", encryptionKeyBase64 };
const factor = {
  id: "factor-a", organizationId: "org-a", userId: "user-a",
  encryptedSecret: encryptTotpSecret({ ...context, secret }),
  keyVersion: "v1", verifiedAt: now, disabledAt: null,
};
function codeAt(date: Date): string {
  const step = Math.floor(date.getTime() / 30000);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
function setup(count = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  return {
    updateMany,
    input: {
      store: { mfaTotpFactor: { updateMany } }, factor, organizationId: "org-a",
      userId: "user-a", code: codeAt(now), now, encryptionKeyBase64,
    },
  };
}
describe("TOTP replay reservation", () => {
  it("atomically advances the last-used step after successful verification", async () => {
    const { input, updateMany } = setup();
    expect(await verifyAndReserveTotpStep(input)).toBe(true);
    const step = BigInt(Math.floor(now.getTime() / 30000));
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "factor-a", organizationId: "org-a", userId: "user-a",
        verifiedAt: { not: null }, disabledAt: null,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
      },
      data: { lastUsedStep: step },
    });
  });
  it("rejects already-used steps when conditional update loses the race", async () => {
    const { input } = setup(0);
    expect(await verifyAndReserveTotpStep(input)).toBe(false);
  });
  it("rejects invalid codes, cross-tenant access, and disabled or unverified factors", async () => {
    const { input, updateMany } = setup();
    expect(await verifyAndReserveTotpStep({ ...input, code: "invalid" })).toBe(false);
    expect(await verifyAndReserveTotpStep({ ...input, organizationId: "org-b" })).toBe(false);
    expect(await verifyAndReserveTotpStep({ ...input, factor: { ...factor, disabledAt: now } })).toBe(false);
    expect(await verifyAndReserveTotpStep({ ...input, factor: { ...factor, verifiedAt: null } })).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
