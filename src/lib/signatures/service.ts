import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";
import { verifyPassword } from "../security/crypto";
import { hashApprovalPayload, type ApprovalPayload } from "./payload";

export interface ApprovalEvidence {
  organizationId: string;
  userId: string;
  passwordHash: string;
  documentId: string;
  documentVersionId: string;
  revisionLabel: string;
  contentHash: string;
  status: string;
  lockVersion: number;
}

export interface ApprovalSignatureStore {
  loadEvidence(organizationId: string, userId: string, versionId: string): Promise<ApprovalEvidence | null>;
  recentFailedReauthentications(organizationId: string, userId: string, since: Date): Promise<number>;
  recordFailedReauthentication(evidence: ApprovalEvidence, occurredAt: Date): Promise<void>;
  commitApproval(input: ApprovalPayload & {
    expectedLockVersion: number;
    payloadHash: string;
    authenticationValidUntil: Date;
  }): Promise<{ signatureId: string } | null>;
}

export interface SignApprovalInput {
  organizationId: string;
  versionId: string;
  expectedLockVersion: number;
  password: string;
  confirmed: boolean;
}

export class ApprovalSignatureService {
  constructor(
    private readonly store: ApprovalSignatureStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async signApproval(context: AuthorizationContext, input: SignApprovalInput) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "document.approve" });
    if (!input.confirmed) throw new SignatureValidationError("Signature meaning must be confirmed");
    if (!Number.isSafeInteger(input.expectedLockVersion) || input.expectedLockVersion < 0) {
      throw new SignatureValidationError("Invalid lock version");
    }

    const evidence = await this.store.loadEvidence(input.organizationId, context.userId, input.versionId);
    if (!evidence) throw new Error("Access denied");
    if (evidence.status !== "IN_REVIEW") throw new SignatureValidationError("Document is not awaiting approval");
    if (evidence.lockVersion !== input.expectedLockVersion) throw new SignatureConcurrencyError();

    const occurredAt = this.clock();
    const recentFailures = await this.store.recentFailedReauthentications(
      evidence.organizationId,
      evidence.userId,
      new Date(occurredAt.getTime() - 15 * 60 * 1000),
    );
    if (recentFailures >= 5) throw new ReauthenticationThrottledError();
    if (!verifyPassword(input.password, evidence.passwordHash)) {
      await this.store.recordFailedReauthentication(evidence, occurredAt);
      throw new ReauthenticationFailedError();
    }

    const payload: ApprovalPayload = {
      organizationId: evidence.organizationId,
      signerUserId: evidence.userId,
      documentId: evidence.documentId,
      documentVersionId: evidence.documentVersionId,
      revisionLabel: evidence.revisionLabel,
      contentHash: evidence.contentHash,
      signedAt: occurredAt,
    };
    const result = await this.store.commitApproval({
      ...payload,
      expectedLockVersion: input.expectedLockVersion,
      payloadHash: hashApprovalPayload(payload),
      authenticationValidUntil: new Date(occurredAt.getTime() + 5 * 60 * 1000),
    });
    if (!result) throw new SignatureConcurrencyError();
    return { ...result, signedAt: occurredAt, status: "APPROVED" as const };
  }
}

export class ReauthenticationFailedError extends Error { constructor() { super("Reauthentication failed"); this.name = "ReauthenticationFailedError"; } }
export class ReauthenticationThrottledError extends Error { constructor() { super("Too many reauthentication attempts"); this.name = "ReauthenticationThrottledError"; } }
export class SignatureConcurrencyError extends Error { constructor() { super("The document changed; reload before signing"); this.name = "SignatureConcurrencyError"; } }
export class SignatureValidationError extends Error { constructor(message: string) { super(message); this.name = "SignatureValidationError"; } }
