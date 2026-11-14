import { MFA_ENROLLMENT_TTL_MS } from "./mfa-enrollment-confirmation";

export interface PendingEnrollmentStore {
  mfaTotpFactor: {
    findUnique(args: { where: { organizationId_userId: {
      organizationId: string; userId: string;
    } } }): Promise<{
      id: string; enrolledAt: Date; verifiedAt: Date | null; disabledAt: Date | null;
    } | null>;
    create(args: { data: {
      organizationId: string; userId: string; encryptedSecret: string; keyVersion: string;
    } }): Promise<unknown>;
    updateMany(args: {
      where: { id: string; organizationId: string; userId: string;
        verifiedAt: null; disabledAt: null; enrolledAt: { lt: Date } };
      data: { encryptedSecret: string; keyVersion: string; enrolledAt: Date;
        enrollmentFailedAttempts: number; lastUsedStep: null };
    }): Promise<{ count: number }>;
  };
}

// Caller must reauthenticate the account and validate that MFA is not enabled.
// Only an expired, never-verified, non-disabled factor can be replaced.
// Conditional update prevents concurrent restart requests from both succeeding.
export async function storePendingTotpEnrollment(input: {
  store: PendingEnrollmentStore; organizationId: string; userId: string;
  encryptedSecret: string; keyVersion: string; now: Date;
}): Promise<boolean> {
  const { store, organizationId, userId, encryptedSecret, keyVersion, now } = input;
  if (!organizationId || !userId || !Number.isFinite(now.getTime())) return false;
  const existing = await store.mfaTotpFactor.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!existing) {
    await store.mfaTotpFactor.create({
      data: { organizationId, userId, encryptedSecret, keyVersion },
    });
    return true;
  }
  const expiredBefore = new Date(now.getTime() - MFA_ENROLLMENT_TTL_MS);
  if (existing.verifiedAt !== null || existing.disabledAt !== null ||
      !Number.isFinite(existing.enrolledAt.getTime()) ||
      existing.enrolledAt.getTime() >= expiredBefore.getTime()) return false;
  const result = await store.mfaTotpFactor.updateMany({
    where: { id: existing.id, organizationId, userId, verifiedAt: null, disabledAt: null,
      enrolledAt: { lt: expiredBefore } },
    data: { encryptedSecret, keyVersion, enrolledAt: now,
      enrollmentFailedAttempts: 0, lastUsedStep: null },
  });
  return result.count === 1;
}
