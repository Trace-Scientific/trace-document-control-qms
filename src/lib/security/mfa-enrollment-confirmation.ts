import { decryptTotpSecret } from "./mfa-totp-encryption";
import { verifyTotpCode } from "./mfa-totp";

// Internal only: the caller must establish a recent, authenticated
// reauthentication event before invoking this transaction-scoped operation.
// Both writes must commit together; failure must roll back the transaction.
export interface EnrollmentConfirmationTransaction {
  mfaTotpFactor: {
    findUnique(args: { where: { organizationId_userId: {
      organizationId: string; userId: string;
    } } }): Promise<{
      id: string; organizationId: string; userId: string;
      encryptedSecret: string; keyVersion: string;
      verifiedAt: Date | null; disabledAt: Date | null;
    } | null>;
    updateMany(args: {
      where: { id: string; organizationId: string; userId: string;
        verifiedAt: null; disabledAt: null };
      data: { verifiedAt: Date; lastUsedStep: bigint };
    }): Promise<{ count: number }>;
  };
  user: {
    updateMany(args: {
      where: { id: string; organizationId: string; status: "ACTIVE"; mfaEnabled: false };
      data: { mfaEnabled: true };
    }): Promise<{ count: number }>;
  };
}

export async function confirmTotpEnrollmentInTransaction(input: {
  transaction: EnrollmentConfirmationTransaction;
  organizationId: string; userId: string; code: string;
  now: Date; encryptionKeyBase64: string;
}): Promise<boolean> {
  const { transaction, organizationId, userId, code, now, encryptionKeyBase64 } = input;
  if (!organizationId || !userId || !/^\d{6}$/.test(code) ||
      !Number.isFinite(now.getTime())) return false;
  const factor = await transaction.mfaTotpFactor.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!factor || factor.organizationId !== organizationId || factor.userId !== userId ||
      factor.verifiedAt !== null || factor.disabledAt !== null) return false;
  const secret = decryptTotpSecret({
    encryptedSecret: factor.encryptedSecret, organizationId, userId,
    keyVersion: factor.keyVersion, encryptionKeyBase64,
  });
  let step: number | null;
  try {
    step = verifyTotpCode({ secret, code, now });
  } finally {
    secret.fill(0);
  }
  if (step === null) return false;
  const reserved = await transaction.mfaTotpFactor.updateMany({
    where: { id: factor.id, organizationId, userId, verifiedAt: null, disabledAt: null },
    data: { verifiedAt: now, lastUsedStep: BigInt(step) },
  });
  if (reserved.count !== 1) return false;
  const enabled = await transaction.user.updateMany({
    where: { id: userId, organizationId, status: "ACTIVE", mfaEnabled: false },
    data: { mfaEnabled: true },
  });
  if (enabled.count !== 1) {
    // Abort the enclosing transaction: never commit a verified factor
    // without enabling MFA on the matching active account.
    throw new Error("MFA enrollment activation conflict");
  }
  return true;
}
