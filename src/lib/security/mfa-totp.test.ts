import { describe, expect, it } from "vitest";
import { verifyTotpCode } from "./mfa-totp";

// RFC 6238 SHA-1 reference vectors use eight digits; six-digit codes are the
// final six digits of those values for the same counters.
const secret = Buffer.from("12345678901234567890", "ascii");
describe("TOTP verifier primitive", () => {
  it("accepts RFC 6238 SHA-1 reference counters at six digits", () => {
    expect(verifyTotpCode({ secret, code: "287082", now: new Date(59_000), allowedDriftSteps: 0 })).toBe(1);
    expect(verifyTotpCode({ secret, code: "081804", now: new Date(1_111_111_109_000), allowedDriftSteps: 0 })).toBe(37037036);
    expect(verifyTotpCode({ secret, code: "005924", now: new Date(1_234_567_890_000), allowedDriftSteps: 0 })).toBe(41152263);
  });
  it("rejects wrong, malformed, and too-short secrets", () => {
    expect(verifyTotpCode({ secret, code: "000000", now: new Date(59_000), allowedDriftSteps: 0 })).toBeNull();
    expect(verifyTotpCode({ secret, code: "28708x", now: new Date(59_000) })).toBeNull();
    expect(verifyTotpCode({ secret: Buffer.alloc(8), code: "287082", now: new Date(59_000) })).toBeNull();
  });
  it("permits only a bounded one-step drift", () => {
    expect(verifyTotpCode({ secret, code: "287082", now: new Date(89_000) })).toBe(1);
    expect(verifyTotpCode({ secret, code: "287082", now: new Date(119_000) })).toBeNull();
    expect(() => verifyTotpCode({ secret, code: "287082", allowedDriftSteps: 2 })).toThrow("Invalid TOTP drift window");
  });
});
