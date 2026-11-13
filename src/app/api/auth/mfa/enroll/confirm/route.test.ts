import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/account-mutation-origin", () => ({
  isSameOriginAccountMutation: vi.fn(),
}));
vi.mock("@/lib/security/mfa-enrollment-reauth", () => ({
  reauthenticateForMfaEnrollment: vi.fn(),
}));
vi.mock("@/lib/security/mfa-enrollment-confirmation", () => ({
  confirmTotpEnrollmentInTransaction: vi.fn(),
}));
vi.mock("@/lib/security/mfa-enrollment-serializable", () => ({
  retrySerializableEnrollment: vi.fn((callback: () => Promise<unknown>) => callback()),
}));
vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((callback: (transaction: unknown) => Promise<unknown>) => callback({})) },
}));

import { isSameOriginAccountMutation } from "@/lib/security/account-mutation-origin";
import { reauthenticateForMfaEnrollment } from "@/lib/security/mfa-enrollment-reauth";
import { confirmTotpEnrollmentInTransaction } from "@/lib/security/mfa-enrollment-confirmation";
import { db } from "@/lib/db";
import { POST } from "./route";

const request = (body: unknown) => new NextRequest("https://qms.example/api/auth/mfa/enroll/confirm", {
  method: "POST", headers: { origin: "https://qms.example", "content-type": "application/json" },
  body: JSON.stringify(body),
});
const valid = { password: "valid-password", code: "123456" };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.QMS_MFA_ENROLLMENT_ENABLED = "true";
  process.env.QMS_MFA_TOTP_ENCRYPTION_KEY = "test-key";
  vi.mocked(isSameOriginAccountMutation).mockReturnValue(true);
  vi.mocked(reauthenticateForMfaEnrollment).mockResolvedValue({
    organizationId: "org-a", userId: "user-a",
  });
  vi.mocked(confirmTotpEnrollmentInTransaction).mockResolvedValue(true);
  vi.mocked(db.$transaction).mockImplementation(async (callback: never) => callback({}));
});
afterEach(() => {
  delete process.env.QMS_MFA_ENROLLMENT_ENABLED;
  delete process.env.QMS_MFA_TOTP_ENCRYPTION_KEY;
});

describe("MFA enrollment confirmation API", () => {
  it("rejects cross-origin mutations before reauthentication", async () => {
    vi.mocked(isSameOriginAccountMutation).mockReturnValue(false);
    expect((await POST(request(valid))).status).toBe(403);
    expect(reauthenticateForMfaEnrollment).not.toHaveBeenCalled();
  });
  it("fails closed when the feature is disabled", async () => {
    delete process.env.QMS_MFA_ENROLLMENT_ENABLED;
    expect((await POST(request(valid))).status).toBe(503);
    expect(reauthenticateForMfaEnrollment).not.toHaveBeenCalled();
  });
  it("rejects malformed verification input without a database transaction", async () => {
    expect((await POST(request({ ...valid, code: "not-six-digits" }))).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("requires fresh password reauthentication", async () => {
    vi.mocked(reauthenticateForMfaEnrollment).mockResolvedValue(null);
    expect((await POST(request(valid))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("returns a generic error on an incorrect authenticator code", async () => {
    vi.mocked(confirmTotpEnrollmentInTransaction).mockResolvedValue(false);
    const response = await POST(request(valid));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Verification failed." });
  });
  it("enables MFA only after transactional verification", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { mfaEnabled: true } });
    expect(confirmTotpEnrollmentInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a", userId: "user-a", code: "123456" }),
    );
  });
});
