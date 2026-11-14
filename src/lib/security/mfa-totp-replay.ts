import { verifyTotpCode } from "./mfa-totp";
import { decryptTotpSecret } from "./mfa-totp-encryption";

// Transaction-scoped verifier. A conditional high-water-mark update ensures
// the same TOTP step cannot be accepted twice, including concurrent requests.
// Call within the SAME database transaction as challenge consumption/session
// issuance. Never expose a factorVerified flag to clients.
export interface TotpReplayStore {
  mfaTotpFactor: {
    updateMany(args: {
      where: {
        id: string;
        organizationId: string;
        userId: string;
        verifiedAt: { not: null };
        disabledAt: null;
        OR: Array<{ lastUsedStep: null } | { lastUsedStep: { lt: bigint } }>;
      };
      data: { lastUsedStep: bigint };
    }): Promise<{ count: number }>;
  };
}

export async function verifyAndReserveTotpStep(input: {
  store: TotpReplayStore;
  factor: {
    id: string; organizationId: string; userId: string;
    encryptedSecret: string; keyVersion: string;
    verifiedAt: Date | null; disabledAt: Date | null;
  };
  organizationId: string;
  userId: string;
  code: string;
  now: Date;
  encryptionKeyBase64: string;
}): Promise<boolean> {
  const { store, factor, organizationId, userId, code, now, encryptionKeyBase64 } = input;
  if (factor.organizationId !== organizationId || factor.userId !== userId ||
      factor.verifiedAt === null || factor.disabledAt !== null) return false;
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
  const counter = BigInt(step);
  const result = await store.mfaTotpFactor.updateMany({
    where: {
      id: factor.id, organizationId, userId,
      verifiedAt: { not: null }, disabledAt: null,
      OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: counter } }],
    },
    data: { lastUsedStep: counter },
  });
  return result.count === 1;
}
