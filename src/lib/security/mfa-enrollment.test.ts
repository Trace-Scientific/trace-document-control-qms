import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptTotpSecret } from "./mfa-totp-encryption";
import { encodeTotpBase32, prepareTotpEnrollment, verifyEnrollmentCode } from "./mfa-enrollment";

const encryptionKeyBase64 = randomBytes(32).toString("base64");
const organizationId = "org-a", userId = "user-a", keyVersion = "v1";

describe("TOTP enrollment", () => {
  it("encodes RFC4648 Base32 without padding", () => {
    expect(encodeTotpBase32(Buffer.from("12345678901234567890"))).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it("creates a randomized, encrypted seed and standards-compatible provisioning URI", () => {
    const input = { organizationId, userId, keyVersion, encryptionKeyBase64, accountLabel: "admin@example.com" };
    const first = prepareTotpEnrollment(input);
    const second = prepareTotpEnrollment(input);
    expect(first.encryptedSecret).not.toBe(second.encryptedSecret);
    const uri = new URL(first.provisioningUri);
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.hostname).toBe("totp");
    expect(uri.searchParams.get("issuer")).toBe("Trace QMS");
    expect(uri.searchParams.get("digits")).toBe("6");
    expect(uri.searchParams.get("period")).toBe("30");
    const secret = decryptTotpSecret({ encryptedSecret: first.encryptedSecret, organizationId, userId, keyVersion, encryptionKeyBase64 });
    expect(secret).toHaveLength(20);
    expect(uri.searchParams.get("secret")).toBe(encodeTotpBase32(secret));
    expect(first.encryptedSecret).not.toContain(uri.searchParams.get("secret")!);
    const now = new Date("2026-11-13T12:00:00.000Z");
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now.getTime() / 30000)));
    const digest = createHmac("sha1", secret).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
    expect(verifyEnrollmentCode({ secret, code, now })).toBe(true);
    expect(verifyEnrollmentCode({ secret, code: "bad", now })).toBe(false);
    secret.fill(0);
  });
  it("rejects missing identity and invalid seed lengths", () => {
    expect(() => prepareTotpEnrollment({ organizationId: "", userId, keyVersion, encryptionKeyBase64, accountLabel: "x" })).toThrow();
    expect(() => encodeTotpBase32(Buffer.alloc(4))).toThrow();
  });
});
