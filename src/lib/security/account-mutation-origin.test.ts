import { describe, expect, it } from "vitest";
import { isSameOriginAccountMutation } from "./account-mutation-origin";

function request(origin: string | null, url = "https://qms.example.com/settings/security") {
  return {
    headers: new Headers(origin === null ? {} : { origin }),
    nextUrl: new URL(url),
  };
}

describe("MFA enrollment origin protection", () => {
  it("allows the exact application origin", () => {
    expect(isSameOriginAccountMutation(request("https://qms.example.com"))).toBe(true);
  });
  it("rejects cross-origin requests", () => {
    expect(isSameOriginAccountMutation(request("https://attacker.example"))).toBe(false);
  });
  it("rejects missing and malformed origins", () => {
    expect(isSameOriginAccountMutation(request(null))).toBe(false);
    expect(isSameOriginAccountMutation(request("not-a-url"))).toBe(false);
  });
  it("rejects lookalike subdomains and mismatched ports", () => {
    expect(isSameOriginAccountMutation(request("https://qms.example.com.attacker.example"))).toBe(false);
    expect(isSameOriginAccountMutation(request("https://qms.example.com:444"))).toBe(false);
  });
  it("rejects protocol downgrades", () => {
    expect(isSameOriginAccountMutation(request("http://qms.example.com"))).toBe(false);
  });
});
