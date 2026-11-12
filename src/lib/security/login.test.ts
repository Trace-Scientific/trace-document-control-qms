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

  it("does not issue a session when the authentication transaction fails", async () => {
    const tx = {
      authenticationEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
      session: { create: vi.fn().mockRejectedValue(new Error("session storage unavailable")) },
      user: { update: vi.fn() },
    };
    mocks.transaction.mockImplementation((work) => work(tx));
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now })).rejects.toThrow("session storage unavailable");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("sets the session idle and absolute expiration boundaries at login", async () => {
    const tx = {
      authenticationEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
      session: { create: vi.fn().mockResolvedValue({ id: "session-1" }) },
      user: { update: vi.fn().mockResolvedValue(user) },
    };
    mocks.transaction.mockImplementation((work) => work(tx));
    const result = await login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now });
    expect(result.absoluteExpiresAt).toEqual(new Date("2026-08-28T00:00:00.000Z"));
    expect(tx.session.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        createdAt: now,
        lastSeenAt: now,
        idleExpiresAt: new Date("2026-08-27T12:30:00.000Z"),
        absoluteExpiresAt: result.absoluteExpiresAt,
        authenticationEventId: "event-1",
      }),
    }));
  });

  it("records a generic failure and does not create a session", async () => {
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "wrong", now })).rejects.toBeInstanceOf(LoginRejectedError);
    expect(mocks.authenticationEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "LOGIN_FAILURE", outcome: "FAILURE" }) }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects inactive organizations without looking up users or issuing sessions", async () => {
    mocks.organization.findUnique.mockResolvedValue({ id: "org-1", active: false });
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now })).rejects.toBeInstanceOf(LoginRejectedError);
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects inactive users and records a failed login without issuing sessions", async () => {
    mocks.user.findUnique.mockResolvedValue({ ...user, status: "INACTIVE" });
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now })).rejects.toBeInstanceOf(LoginRejectedError);
    expect(mocks.authenticationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "LOGIN_FAILURE", outcome: "FAILURE" }),
    }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects disabled password credentials without issuing sessions", async () => {
    mocks.user.findUnique.mockResolvedValue({ ...user, credential: { ...user.credential, disabledAt: now } });
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now })).rejects.toBeInstanceOf(LoginRejectedError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects unknown users without issuing sessions and records a generic failure", async () => {
    mocks.user.findUnique.mockResolvedValue(null);
    await expect(login({ organizationCode: "orange-county-labs", email: "missing@example.com", password: "correct horse battery staple", now })).rejects.toBeInstanceOf(LoginRejectedError);
    expect(mocks.authenticationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "LOGIN_FAILURE", outcome: "FAILURE", userId: undefined }),
    }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("normalizes organization codes and user emails for tenant-scoped lookup", async () => {
    await expect(login({ organizationCode: "ORANGE-COUNTY-LABS", email: " ADMIN@EXAMPLE.COM ", password: "wrong", now })).rejects.toBeInstanceOf(LoginRejectedError);
    expect(mocks.organization.findUnique).toHaveBeenCalledWith({ where: { loginCode: "orange-county-labs" } });
    expect(mocks.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_email: { organizationId: "org-1", email: "admin@example.com" } },
    }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("records a throttled failure without creating a session", async () => {
    mocks.authenticationEvent.count.mockResolvedValue(5);
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now })).rejects.toMatchObject({ throttled: true });
    expect(mocks.authenticationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "LOGIN_FAILURE", outcome: "FAILURE", metadata: { reason: "throttled" } }),
    }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("temporarily throttles after five recent failures", async () => {
    mocks.authenticationEvent.count.mockResolvedValue(5);
    await expect(login({ organizationCode: "orange-county-labs", email: "admin@example.com", password: "correct horse battery staple", now })).rejects.toMatchObject({ throttled: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
