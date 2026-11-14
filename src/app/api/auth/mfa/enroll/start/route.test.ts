import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/account-mutation-origin", () => ({
  isSameOriginAccountMutation: vi.fn(),
}));
vi.mock("@/lib/security/mfa-enrollment-reauth", () => ({
  reauthenticateForMfaEnrollment: vi.fn(),
}));
vi.mock("@/lib/security/mfa-enrollment", () => ({
  prepareTotpEnrollment: vi.fn(),
}));
vi.mock("@/lib/security/mfa-enrollment-recovery", () => ({
  storePendingTotpEnrollment: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: vi.fn() } },
}));

import { isSameOriginAccountMutation } from "@/lib/security/account-mutation-origin";
import { reauthenticateForMfaEnrollment } from "@/lib/security/mfa-enrollment-reauth";
import { prepareTotpEnrollment } from "@/lib/security/mfa-enrollment";
import { storePendingTotpEnrollment } from "@/lib/security/mfa-enrollment-recovery";
import { db } from "@/lib/db";
import { POST } from "./route";

const valid = { password: "correct-password" };
function request(body: unknown) {
  return new NextRequest("https://qms.example/api/auth/mfa/enroll/start", {
    method: "POST",
    headers: { origin: "https://qms.example", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.QMS_MFA_ENROLLMENT_ENABLED = "true";
  process.env.QMS_MFA_TOTP_ENCRYPTION_KEY = "test-key";
  vi.mocked(isSameOriginAccountMutation).mockReturnValue(true);
  vi.mocked(reauthenticateForMfaEnrollment).mockResolvedValue({
    organizationId: "org-a", userId: "user-a",
  });
  vi.mocked(db.user.findUnique).mockResolvedValue({ email: "user@example.com" } as never);
  vi.mocked(prepareTotpEnrollment).mockReturnValue({
    encryptedSecret: "encrypted-secret", provisioningUri: "otpauth://totp/test",
  });
  vi.mocked(storePendingTotpEnrollment).mockResolvedValue(true);
});
afterEach(() => {
  delete process.env.QMS_MFA_ENROLLMENT_ENABLED;
  delete process.env.QMS_MFA_TOTP_ENCRYPTION_KEY;
});
describe("MFA enrollment start API", () => {
  it("rejects cross-origin requests before reauthentication", async () => {
    vi.mocked(isSameOriginAccountMutation).mockReturnValue(false);
    expect((await POST(request(valid))).status).toBe(403);
    expect(reauthenticateForMfaEnrollment).not.toHaveBeenCalled();
  });
  it("does not allow enrollment unless explicitly enabled", async () => {
    delete process.env.QMS_MFA_ENROLLMENT_ENABLED;
    expect((await POST(request(valid))).status).toBe(503);
    expect(reauthenticateForMfaEnrollment).not.toHaveBeenCalled();
  });
  it("rejects malformed request bodies", async () => {
    expect((await POST(request({ password: "" }))).status).toBe(400);
    expect(storePendingTotpEnrollment).not.toHaveBeenCalled();
  });
  it("rejects missing reauthentication", async () => {
    vi.mocked(reauthenticateForMfaEnrollment).mockResolvedValue(null);
    expect((await POST(request(valid))).status).toBe(403);
    expect(storePendingTotpEnrollment).not.toHaveBeenCalled();
  });
  it("does not reveal the provisioning secret when pending enrollment cannot be stored", async () => {
    vi.mocked(storePendingTotpEnrollment).mockResolvedValue(false);
    const response = await POST(request(valid));
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("otpauth://");
  });
  it("returns a no-store provisioning URI only after a successful database write", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { provisioningUri: "otpauth://totp/test" } });
    expect(storePendingTotpEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-a", userId: "user-a",
      encryptedSecret: "encrypted-secret", keyVersion: "v1",
    }));
  });
});
