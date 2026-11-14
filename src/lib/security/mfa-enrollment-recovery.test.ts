import { describe, expect, it, vi } from "vitest";
import { storePendingTotpEnrollment } from "./mfa-enrollment-recovery";

const now = new Date("2026-11-13T12:00:00Z");
function setup(existing: unknown) {
  const store = { mfaTotpFactor: {
    findUnique: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  } };
  const input = { store, organizationId: "org-a", userId: "user-a",
    encryptedSecret: "encrypted-new", keyVersion: "v1", now };
  return { store, input };
}
describe("expired MFA enrollment recovery", () => {
  it("creates a first-time pending factor", async () => {
    const { store, input } = setup(null);
    expect(await storePendingTotpEnrollment(input)).toBe(true);
    expect(store.mfaTotpFactor.create).toHaveBeenCalledOnce();
  });
  it("restarts only expired, unverified, active pending factors", async () => {
    const { store, input } = setup({
      id: "factor-a", enrolledAt: new Date(now.getTime() - 600001),
      verifiedAt: null, disabledAt: null,
    });
    expect(await storePendingTotpEnrollment(input)).toBe(true);
    expect(store.mfaTotpFactor.updateMany).toHaveBeenCalledWith({
      where: { id: "factor-a", organizationId: "org-a", userId: "user-a",
        verifiedAt: null, disabledAt: null,
        enrolledAt: { lt: new Date(now.getTime() - 600000) } },
      data: { encryptedSecret: "encrypted-new", keyVersion: "v1",
        enrolledAt: now, enrollmentFailedAttempts: 0, lastUsedStep: null },
    });
  });
  it("never replaces a verified factor", async () => {
    const { store, input } = setup({
      id: "factor-a", enrolledAt: new Date(0), verifiedAt: now, disabledAt: null,
    });
    expect(await storePendingTotpEnrollment(input)).toBe(false);
    expect(store.mfaTotpFactor.updateMany).not.toHaveBeenCalled();
  });
  it("never replaces a disabled factor", async () => {
    const { store, input } = setup({
      id: "factor-a", enrolledAt: new Date(0), verifiedAt: null, disabledAt: now,
    });
    expect(await storePendingTotpEnrollment(input)).toBe(false);
  });
  it("does not restart an unexpired factor", async () => {
    const { store, input } = setup({
      id: "factor-a", enrolledAt: new Date(now.getTime() - 600000),
      verifiedAt: null, disabledAt: null,
    });
    expect(await storePendingTotpEnrollment(input)).toBe(false);
  });
  it("fails closed when a concurrent restart wins", async () => {
    const { store, input } = setup({
      id: "factor-a", enrolledAt: new Date(0), verifiedAt: null, disabledAt: null,
    });
    store.mfaTotpFactor.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await storePendingTotpEnrollment(input)).toBe(false);
  });
});
