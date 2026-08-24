import { describe, expect, it } from "vitest";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  opaqueTokenMatches,
  verifyPassword,
} from "./crypto";

describe("security cryptography", () => {
  it("stores only a deterministic hash of an opaque session token", () => {
    const token = generateOpaqueToken();
    const hash = hashOpaqueToken(token);

    expect(token).not.toBe(hash);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(opaqueTokenMatches(token, hash)).toBe(true);
    expect(opaqueTokenMatches(token + "x", hash)).toBe(false);
  });

  it("uses salted password hashes and rejects incorrect passwords", () => {
    const first = hashPassword("correct horse battery staple");
    const second = hashPassword("correct horse battery staple");

    expect(first).not.toBe(second);
    expect(verifyPassword("correct horse battery staple", first)).toBe(true);
    expect(verifyPassword("incorrect password", first)).toBe(false);
    expect(verifyPassword("anything", "not-a-supported-hash")).toBe(false);
  });

  it("rejects undersized passwords", () => {
    expect(() => hashPassword("too-short")).toThrow(/12 characters/);
  });
});
