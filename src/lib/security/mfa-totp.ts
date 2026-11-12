import { createHmac, timingSafeEqual } from "node:crypto";

// RFC 6238 verifier primitive. Enrollment, encrypted secret storage, attempt limits,
// replay protection and challenge consumption must be implemented before use in login.
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const MAX_SECRET_BYTES = 128;

export function verifyTotpCode(input: {
  secret: Uint8Array;
  code: string;
  now?: Date;
  allowedDriftSteps?: number;
}): number | null {
  const { secret, code, now = new Date(), allowedDriftSteps = 1 } = input;
  if (!Number.isInteger(allowedDriftSteps) || allowedDriftSteps < 0 || allowedDriftSteps > 1) {
    throw new Error("Invalid TOTP drift window");
  }
  if (secret.length < 16 || secret.length > MAX_SECRET_BYTES || !/^\d{6}$/.test(code)) return null;
  const seconds = now.getTime() / 1000;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const currentStep = Math.floor(seconds / PERIOD_SECONDS);
  const supplied = Buffer.from(code, "ascii");
  for (let drift = -allowedDriftSteps; drift <= allowedDriftSteps; drift++) {
    const step = currentStep + drift;
    if (step < 0) continue;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac("sha1", secret).update(counter).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** DIGITS);
    const expected = Buffer.from(binary.toString().padStart(DIGITS, "0"), "ascii");
    if (timingSafeEqual(supplied, expected)) return step;
  }
  return null;
}
