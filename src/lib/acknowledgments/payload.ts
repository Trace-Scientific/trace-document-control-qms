import { createHash } from "node:crypto";

export const ACKNOWLEDGMENT_MEANING = "I acknowledge that I have read and understand this controlled document.";

export interface AcknowledgmentPayload { organizationId: string; userId: string; assignmentId: string; documentId: string; documentVersionId: string; revisionLabel: string; contentHash: string; signedAt: Date; }

export function hashAcknowledgmentPayload(input: AcknowledgmentPayload) {
  const canonical = JSON.stringify({ schema: "trace-qms-signature-v1", organizationId: input.organizationId, signerUserId: input.userId, assignmentId: input.assignmentId, entityType: "DocumentVersion", documentId: input.documentId, documentVersionId: input.documentVersionId, revisionLabel: input.revisionLabel, contentHash: input.contentHash, meaning: "ACKNOWLEDGED", meaningText: ACKNOWLEDGMENT_MEANING, signedAt: input.signedAt.toISOString() });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
