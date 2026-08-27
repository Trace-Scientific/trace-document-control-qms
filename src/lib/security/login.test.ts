import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "./crypto";

const mocks = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  authenticationEvent: { count: vi.fn(), create: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("../db", () => ({ db: {
  organization: mocks.organization,
  user: mocks.user,
  authenticationEvent: mocks.authenticationEvent,
  $transaction: mocks.transaction,
} }));

import { login, LoginRejectedError } from "./login";

const now = new Date("2026-08-27T12:00:00.000Z");
const user = { id: "user-1", firstName: "Quality", lastName: "Admin", status: "ACTIVE", credential: { disabledAt: null, passwordHash: hashPassword("correct horse battery staple") } };

describe("login session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organization.findUnique.mockResolvedValue({ id: "org-1", active: true });
    mocks.user.findUnique.mockResolvedValue(user);
    mocks.authenticationEvent.count.mockResolvedValue(0);
    mocks.authenticationEvent.create.mockResolvedValue({ id: "failed-1" });
  });

  it("issues a hashed session token and attributable authentication event", async () => {
    const tx = {
      authenticationEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
      session: { create: vi.fn().mockResolvedValue({ id: "session-1" }) },
      user: { update: vi.fn().mockResolvedValue(user) },
    };
    mocks.transaction.mockImplementation((work) => work(tx));
    const result = await login({ organizationCode: "orange-county-labs", email: "ADMIN@EXAMPLE.COM", password: "correct horse battery staple", now });
    expect(result.token).toBeTruthy();
    expect(tx.session.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), absoluteExpiresAt: new Date("2026-08-28T00:00:00.000Z") }) }));
    expect(tx.authenticationEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "LOGIN", outcome: "SUCCESS" }) }));
  });

  it("records a generic failure and does not create a session", async () => {
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "wrong", now })).rejects.toBeInstanceOf(LoginRejectedError);
    expect(mocks.authenticationEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "LOGIN_FAILURE", outcome: "FAILURE" }) }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("temporarily throttles after five recent failures", async () => {
    mocks.authenticationEvent.count.mockResolvedValue(5);
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now })).rejects.toMatchObject({ throttled: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
