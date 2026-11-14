import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../db", () => ({
  db: {
    $transaction: vi.fn(),
  },
}));
vi.mock("./mfa-login-transaction", () => ({
  completeMfaLoginInTransaction: vi.fn(),
}));
import { db } from "../db";
import { completeMfaLoginInTransaction } from "./mfa-login-transaction";
import { verifyMfaLogin } from "./mfa-login-service";

const challengeToken = "A".repeat(43);
const now = new Date("2026-11-13T12:00:00Z");
const input = { challengeToken, code: "123456", now };
function mockTransaction(overrides: {
  challenge?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
} = {}) {
  const challenge = overrides.challenge === undefined ? {
    organizationId: "org-a", userId: "user-a", consumedAt: null,
    expiresAt: new Date(now.getTime() + 300000), failedAttempts: 0,
  } : overrides.challenge;
  const user = overrides.user === undefined ? {
    id: "user-a", organizationId: "org-a", status: "ACTIVE", mfaEnabled: true,
    organization: { active: true },
  } : overrides.user;
  const transaction = {
    pendingMfaChallenge: { findUnique: vi.fn().mockResolvedValue(challenge) },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
  };
  vi.mocked(db.$transaction).mockImplementation((async (callback: (tx: typeof transaction) => Promise<unknown>) =>
    callback(transaction)) as unknown as typeof db.$transaction);
  return transaction;
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.QMS_MFA_TOTP_ENCRYPTION_KEY = "test-encryption-key";
  vi.mocked(completeMfaLoginInTransaction).mockResolvedValue({
    token: "session-token", absoluteExpiresAt: new Date(now.getTime() + 3600000),
  });
});
afterEach(() => {
  delete process.env.QMS_MFA_TOTP_ENCRYPTION_KEY;
});
describe("MFA login service transaction boundary", () => {
  it("rejects malformed challenges without database access", async () => {
    expect(await verifyMfaLogin({ ...input, challengeToken: "bad" })).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects missing encryption configuration", async () => {
    delete process.env.QMS_MFA_TOTP_ENCRYPTION_KEY;
    await expect(verifyMfaLogin(input)).rejects.toThrow("MFA encryption key");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects expired challenges before loading user", async () => {
    const transaction = mockTransaction({ challenge: {
      organizationId: "org-a", userId: "user-a", consumedAt: null,
      expiresAt: now, failedAttempts: 0,
    } });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
  });
  it("rejects locked challenges", async () => {
    mockTransaction({ challenge: {
      organizationId: "org-a", userId: "user-a", consumedAt: null,
      expiresAt: new Date(now.getTime() + 300000), failedAttempts: 5,
    } });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(completeMfaLoginInTransaction).not.toHaveBeenCalled();
  });
  it("rejects tenant mismatch before verifying the authenticator", async () => {
    mockTransaction({ user: {
      id: "user-a", organizationId: "org-b", status: "ACTIVE", mfaEnabled: true,
      organization: { active: true },
    } });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(completeMfaLoginInTransaction).not.toHaveBeenCalled();
  });
  it("rejects inactive organizations", async () => {
    mockTransaction({ user: {
      id: "user-a", organizationId: "org-a", status: "ACTIVE", mfaEnabled: true,
      organization: { active: false },
    } });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(completeMfaLoginInTransaction).not.toHaveBeenCalled();
  });
  it("rejects a missing challenge without loading a user", async () => {
    const transaction = mockTransaction({ challenge: null });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
    expect(completeMfaLoginInTransaction).not.toHaveBeenCalled();
  });
  it("rejects a previously consumed challenge", async () => {
    const transaction = mockTransaction({ challenge: {
      organizationId: "org-a", userId: "user-a", consumedAt: now,
      expiresAt: new Date(now.getTime() + 300000), failedAttempts: 0,
    } });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
  });
  it("rejects suspended users before verifying the authenticator", async () => {
    mockTransaction({ user: {
      id: "user-a", organizationId: "org-a", status: "SUSPENDED", mfaEnabled: true,
      organization: { active: true },
    } });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(completeMfaLoginInTransaction).not.toHaveBeenCalled();
  });
  it("rejects users without enabled MFA", async () => {
    mockTransaction({ user: {
      id: "user-a", organizationId: "org-a", status: "ACTIVE", mfaEnabled: false,
      organization: { active: true },
    } });
    expect(await verifyMfaLogin(input)).toBeNull();
    expect(completeMfaLoginInTransaction).not.toHaveBeenCalled();
  });
  it("verifies inside a serializable transaction with server-resolved identity", async () => {
    mockTransaction();
    expect((await verifyMfaLogin(input))?.token).toBe("session-token");
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(completeMfaLoginInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      challengeToken, organizationId: "org-a", userId: "user-a", code: "123456",
    }));
  });
});
