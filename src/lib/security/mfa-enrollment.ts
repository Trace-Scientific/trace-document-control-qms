import { randomBytes } from "node:crypto";
import { encryptTotpSecret } from "./mfa-totp-encryption";
import { verifyTotpCode } from "./mfa-totp";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeTotpBase32(secret: Uint8Array): string {
  if (secret.length < 16 || secret.length > 128) throw new Error("Invalid TOTP seed length");
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of secret) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits -= 5)) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

// Internal enrollment helper: call only after authenticating an existing
// session and requiring a fresh password or other approved reauthentication.
// Never persist or log the plaintext provisioning URI or Base32 seed.
export function prepareTotpEnrollment(input: {
  organizationId: string; userId: string; accountLabel: string;
  encryptionKeyBase64: string; keyVersion: string;
}): { encryptedSecret: string; provisioningUri: string } {
  const { organizationId, userId, accountLabel, encryptionKeyBase64, keyVersion } = input;
  if (!organizationId || !userId || !accountLabel.trim() || accountLabel.length > 254) {
    throw new Error("Invalid enrollment identity");
  }
  const secret = randomBytes(20);
  try {
    const encryptedSecret = encryptTotpSecret({
      secret, organizationId, userId, encryptionKeyBase64, keyVersion,
    });
    const provisioningUri = "otpauth://totp/" +
      encodeURIComponent("Trace QMS:" + accountLabel) +
      "?secret=" + encodeTotpBase32(secret) +
      "&issuer=" + encodeURIComponent("Trace QMS") +
      "&algorithm=SHA1&digits=6&period=30";
    return { encryptedSecret, provisioningUri };
  } finally {
    secret.fill(0);
  }
}

// Enrollment must be confirmed with a code before mfaEnabled is set.
// The caller must atomically update the verified factor and user in one
// tenant-scoped transaction, rejecting already verified or disabled factors.
export function verifyEnrollmentCode(input: {
  secret: Uint8Array; code: string; now: Date;
}): boolean {
  return verifyTotpCode({ ...input, allowedDriftSteps: 1 }) !== null;
}
