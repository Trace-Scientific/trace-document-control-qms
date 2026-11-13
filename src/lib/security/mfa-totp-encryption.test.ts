import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret } from "./mfa-totp-encryption";

const encryptionKeyBase64 = randomBytes(32).toString("base64");
const secret = randomBytes(20);
const context = { organizationId: "org-a", userId: "user-a", keyVersion: "v1", encryptionKeyBase64 };

describe("TOTP secret encryption", () => {
  it("round trips with randomized ciphertext", () => {
    const a = encryptTotpSecret({ ...context, secret });
    const b = encryptTotpSecret({ ...context, secret });
    expect(a).not.toBe(b);
    expect(decryptTotpSecret({ ...context, encryptedSecret: a })).toEqual(secret);
  });
  it("rejects cross-tenant and cross-user decryption", () => {
    const encryptedSecret = encryptTotpSecret({ ...context, secret });
    expect(() => decryptTotpSecret({ ...context, organizationId: "org-b", encryptedSecret })).toThrow();
    expect(() => decryptTotpSecret({ ...context, userId: "user-b", encryptedSecret })).toThrow();
    expect(() => decryptTotpSecret({ ...context, keyVersion: "v2", encryptedSecret })).toThrow();
  });
  it("rejects tampering, wrong keys and malformed payloads", () => {
    const encryptedSecret = encryptTotpSecret({ ...context, secret });
    const packed = Buffer.from(encryptedSecret, "base64");
    packed[packed.length - 1] ^= 1;
    expect(() => decryptTotpSecret({ ...context, encryptedSecret: packed.toString("base64") })).toThrow();
    expect(() => decryptTotpSecret({ ...context, encryptedSecret, encryptionKeyBase64: randomBytes(32).toString("base64") })).toThrow();
    expect(() => decryptTotpSecret({ ...context, encryptedSecret: "garbage" })).toThrow();
  });
  it("rejects invalid key sizes and short seeds", () => {
    expect(() => encryptTotpSecret({ ...context, secret, encryptionKeyBase64: randomBytes(16).toString("base64") })).toThrow();
    expect(() => encryptTotpSecret({ ...context, secret: randomBytes(8) })).toThrow();
  });
});
