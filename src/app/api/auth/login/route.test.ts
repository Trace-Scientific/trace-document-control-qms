import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/login", () => ({
  login: vi.fn(),
  LoginRejectedError: class LoginRejectedError extends Error {
    constructor(public readonly throttled = false) {
      super("Sign-in failed");
    }
  },
}));
import { login, LoginRejectedError } from "@/lib/security/login";
import { POST } from "./route";

const valid = {
  organizationCode: "synthetic-lab",
  email: "test@example.invalid",
  password: "synthetic-password",
};
function request(body: unknown) {
  return new NextRequest("https://qms.example/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => vi.resetAllMocks());

describe("password login API cache and session boundaries", () => {
  it("does not cache MFA challenges or issue a session before verification", async () => {
    vi.mocked(login).mockResolvedValue({
      mfaRequired: true, token: undefined, absoluteExpiresAt: undefined,
      challengeToken: "A".repeat(43), expiresAt: new Date("2026-11-14T12:05:00Z"),
      user: { id: "synthetic-user", firstName: "Synthetic", lastName: "Tester" },
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await response.json()).data).toMatchObject({
      mfaRequired: true, challengeToken: "A".repeat(43),
    });
  });

  it("does not cache successful password-only session responses", async () => {
    vi.mocked(login).mockResolvedValue({
      mfaRequired: false, token: "opaque-session-token",
      absoluteExpiresAt: new Date("2026-11-14T12:00:00Z"),
      user: { id: "synthetic-user", firstName: "Synthetic", lastName: "Tester" },
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("qms_session=opaque-session-token");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
  });

  it("does not cache rejected credentials or set a session", async () => {
    vi.mocked(login).mockRejectedValue(new LoginRejectedError());
    const response = await POST(request(valid));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not cache throttled login responses", async () => {
    vi.mocked(login).mockRejectedValue(new LoginRejectedError(true));
    const response = await POST(request(valid));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not access authentication services for malformed requests", async () => {
    const response = await POST(request({ ...valid, organizationCode: "?" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(login).not.toHaveBeenCalled();
  });
});
