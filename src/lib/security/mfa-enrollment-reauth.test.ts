import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("../db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("./authenticated-request", () => ({ authenticateRequest: vi.fn() }));
vi.mock("./crypto", () => ({ verifyPassword: vi.fn() }));
import { db } from "../db";
import { authenticateRequest } from "./authenticated-request";
import { verifyPassword } from "./crypto";
import { reauthenticateForMfaEnrollment } from "./mfa-enrollment-reauth";

const request = {} as NextRequest;
const user = {
  id: "user-a", organizationId: "org-a", status: "ACTIVE",
  mfaEnabled: false, organization: { active: true },
  credential: { passwordHash: "stored-hash", disabledAt: null },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticateRequest).mockResolvedValue({
    userId: "user-a", organizationId: "org-a", userState: "ACTIVE", grants: [],
  });
  vi.mocked(db.user.findUnique).mockResolvedValue(user as never);
  vi.mocked(verifyPassword).mockReturnValue(true);
});

describe("MFA enrollment reauthentication", () => {
  it("accepts a valid session and freshly verified password", async () => {
    await expect(reauthenticateForMfaEnrollment(request, "correct-password")).resolves.toEqual({
      userId: "user-a", organizationId: "org-a",
    });
    expect(verifyPassword).toHaveBeenCalledWith("correct-password", "stored-hash");
  });
  it("rejects a wrong password", async () => {
    vi.mocked(verifyPassword).mockReturnValue(false);
    await expect(reauthenticateForMfaEnrollment(request, "wrong")).resolves.toBeNull();
  });
  it("rejects tenant mismatches", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ ...user, organizationId: "org-b" } as never);
    await expect(reauthenticateForMfaEnrollment(request, "password")).resolves.toBeNull();
    expect(verifyPassword).not.toHaveBeenCalled();
  });
  it("rejects inactive and already-MFA-enabled users", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({ ...user, status: "INACTIVE" } as never);
    expect(await reauthenticateForMfaEnrollment(request, "password")).toBeNull();
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({ ...user, mfaEnabled: true } as never);
    expect(await reauthenticateForMfaEnrollment(request, "password")).toBeNull();
  });
  it("rejects disabled credentials and malformed passwords", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({
      ...user, credential: { ...user.credential, disabledAt: new Date() },
    } as never);
    expect(await reauthenticateForMfaEnrollment(request, "password")).toBeNull();
    expect(await reauthenticateForMfaEnrollment(request, "")).toBeNull();
  });
  it("does not bypass session authentication", async () => {
    vi.mocked(authenticateRequest).mockRejectedValueOnce(new Error("Authentication required"));
    await expect(reauthenticateForMfaEnrollment(request, "password")).rejects.toThrow("Authentication required");
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
