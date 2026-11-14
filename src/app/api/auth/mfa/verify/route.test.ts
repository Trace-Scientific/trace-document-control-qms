import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/mfa-login-service", () => ({
  verifyMfaLogin: vi.fn(),
}));
import { verifyMfaLogin } from "@/lib/security/mfa-login-service";
import { POST } from "./route";

const challengeToken = "A".repeat(43);
const valid = { challengeToken, code: "123456" };
function request(body: unknown) {
  return new NextRequest("https://qms.example/api/auth/mfa/verify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifyMfaLogin).mockResolvedValue(null);
});
describe("MFA login verification API", () => {
  it("rejects malformed challenge tokens before accessing the login service", async () => {
    const response = await POST(request({ ...valid, challengeToken: "short" }));
    expect(response.status).toBe(401);
    expect(verifyMfaLogin).not.toHaveBeenCalled();
  });
  it("rejects malformed authenticator codes before accessing the login service", async () => {
    expect((await POST(request({ ...valid, code: "12345x" }))).status).toBe(401);
    expect(verifyMfaLogin).not.toHaveBeenCalled();
  });
  it("rejects extra request fields", async () => {
    expect((await POST(request({ ...valid, organizationId: "another-tenant" }))).status).toBe(401);
    expect(verifyMfaLogin).not.toHaveBeenCalled();
  });
  it("does not create a session when the challenge or code is rejected", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ error: "Verification failed." });
  });
  it("issues an HttpOnly SameSite strict session only after successful MFA", async () => {
    vi.mocked(verifyMfaLogin).mockResolvedValue({
      token: "opaque-session-token",
      absoluteExpiresAt: new Date("2026-11-14T12:00:00Z"),
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { verified: true } });
    expect(verifyMfaLogin).toHaveBeenCalledWith(valid);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("qms_session=opaque-session-token");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(cookie).toContain("Path=/");
  });
  it("returns a generic error without a session on service failure", async () => {
    vi.mocked(verifyMfaLogin).mockRejectedValue(new Error("private internal failure"));
    const response = await POST(request(valid));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(JSON.stringify(await response.json())).not.toContain("private internal failure");
  });
});
