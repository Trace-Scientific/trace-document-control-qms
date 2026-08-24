import { createHash } from "node:crypto";

export interface ApprovalPayload {
  organizationId: string;
  signerUserId: string;
  documentId: string;
  documentVersionId: string;
  revisionLabel: string;
  contentHash: string;
  signedAt: Date;
}

export const APPROVAL_MEANING = "I approve this controlled document.";

export function canonicalApprovalPayload(input: ApprovalPayload): string {
  return JSON.stringify({
    schema: "trace-qms-signature-v1",
    organizationId: input.organizationId,
    signerUserId: input.signerUserId,
    entityType: "DocumentVersion",
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    revisionLabel: input.revisionLabel,
    contentHash: input.contentHash,
    meaning: "APPROVED",
    meaningText: APPROVAL_MEANING,
    signedAt: input.signedAt.toISOString(),
  });
}

export function hashApprovalPayload(input: ApprovalPayload): string {
  return createHash("sha256").update(canonicalApprovalPayload(input), "utf8").digest("hex");
}
