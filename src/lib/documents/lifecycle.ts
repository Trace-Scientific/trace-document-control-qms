export type DocumentVersionState =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "EFFECTIVE"
  | "SUPERSEDED"
  | "RETIRED";

export type DocumentCommand = "SUBMIT" | "APPROVE" | "REJECT" | "MAKE_EFFECTIVE";

const transitions: Record<DocumentCommand, Partial<Record<DocumentVersionState, DocumentVersionState>>> = {
  SUBMIT: { DRAFT: "IN_REVIEW" },
  APPROVE: { IN_REVIEW: "APPROVED" },
  REJECT: { IN_REVIEW: "DRAFT" },
  MAKE_EFFECTIVE: { APPROVED: "EFFECTIVE" },
};

export function nextDocumentVersionState(
  current: DocumentVersionState,
  command: DocumentCommand,
  reason?: string,
): DocumentVersionState {
  if (command === "REJECT" && !reason?.trim()) {
    throw new DocumentLifecycleError("A rejection reason is required");
  }

  const next = transitions[command][current];
  if (!next) {
    throw new DocumentLifecycleError(`Invalid document transition: ${current} cannot ${command}`);
  }
  return next;
}

export function validateDraftRevision(input: {
  versionNumber: number;
  revisionLabel: string;
  contentHash: string;
  changeSummary: string;
}): void {
  if (!Number.isSafeInteger(input.versionNumber) || input.versionNumber <= 0) {
    throw new DocumentLifecycleError("Version number must be a positive integer");
  }
  if (!input.revisionLabel.trim()) throw new DocumentLifecycleError("Revision label is required");
  if (!/^[a-f0-9]{64}$/.test(input.contentHash)) {
    throw new DocumentLifecycleError("Content hash must be a lowercase SHA-256 digest");
  }
  if (!input.changeSummary.trim()) throw new DocumentLifecycleError("Change summary is required");
}

export class DocumentLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentLifecycleError";
  }
}
