import {
  requireAuthorization,
  type AuthorizationContext,
} from "../security/authorization";
import {
  nextDocumentVersionState,
  validateDraftRevision,
  type DocumentCommand,
  type DocumentVersionState,
} from "./lifecycle";

export interface StoredDocumentVersion {
  id: string;
  organizationId: string;
  documentId: string;
  status: DocumentVersionState;
  lockVersion: number;
}

export interface CreateDraftInput {
  organizationId: string;
  documentTypeId: string;
  documentNumber: string;
  title: string;
  versionNumber: number;
  revisionLabel: string;
  contentHash: string;
  contentText?: string;
  changeSummary: string;
}

export interface TransitionInput {
  organizationId: string;
  versionId: string;
  command: DocumentCommand;
  expectedLockVersion: number;
  reason?: string;
}

export interface DocumentLifecycleStore {
  createDraft(input: CreateDraftInput & { actorUserId: string }): Promise<StoredDocumentVersion>;
  findVersion(organizationId: string, versionId: string): Promise<StoredDocumentVersion | null>;
  applyTransition(input: {
    organizationId: string;
    versionId: string;
    documentId: string;
    actorUserId: string;
    from: DocumentVersionState;
    to: DocumentVersionState;
    command: DocumentCommand;
    expectedLockVersion: number;
    reason?: string;
    occurredAt: Date;
  }): Promise<boolean>;
}

const commandPermissions: Record<DocumentCommand, string> = {
  SUBMIT: "document.submit",
  APPROVE: "document.approve",
  REJECT: "document.review",
  MAKE_EFFECTIVE: "document.make_effective",
};

export class DocumentCommandService {
  constructor(
    private readonly store: DocumentLifecycleStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createDraft(
    context: AuthorizationContext,
    input: CreateDraftInput,
  ): Promise<StoredDocumentVersion> {
    requireAuthorization(context, {
      organizationId: input.organizationId,
      permission: "document.create",
    });
    validateDraftRevision(input);
    if (!input.documentNumber.trim() || !input.title.trim()) {
      throw new DocumentCommandError("Document number and title are required");
    }
    if (!input.contentText?.trim()) throw new DocumentCommandError("Document content is required");
    if (input.contentText.length > 1_000_000) throw new DocumentCommandError("Document content is too large");
    return this.store.createDraft({ ...input, actorUserId: context.userId });
  }

  async transition(
    context: AuthorizationContext,
    input: TransitionInput,
  ): Promise<StoredDocumentVersion> {
    if (input.command === "APPROVE") {
      throw new DocumentSignatureRequiredError();
    }
    requireAuthorization(context, {
      organizationId: input.organizationId,
      permission: commandPermissions[input.command],
    });

    const version = await this.store.findVersion(input.organizationId, input.versionId);
    if (!version) throw new Error("Access denied");
    if (version.lockVersion !== input.expectedLockVersion) {
      throw new DocumentConcurrencyError();
    }

    const next = nextDocumentVersionState(version.status, input.command, input.reason);
    const changed = await this.store.applyTransition({
      organizationId: input.organizationId,
      versionId: version.id,
      documentId: version.documentId,
      actorUserId: context.userId,
      from: version.status,
      to: next,
      command: input.command,
      expectedLockVersion: input.expectedLockVersion,
      reason: input.reason?.trim() || undefined,
      occurredAt: this.clock(),
    });
    if (!changed) throw new DocumentConcurrencyError();

    return { ...version, status: next, lockVersion: version.lockVersion + 1 };
  }
}

export class DocumentConcurrencyError extends Error {
  constructor() {
    super("The document version changed; reload before retrying");
    this.name = "DocumentConcurrencyError";
  }
}

export class DocumentCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentCommandError";
  }
}

export class DocumentSignatureRequiredError extends Error {
  constructor() {
    super("Electronic signature is required for approval");
    this.name = "DocumentSignatureRequiredError";
  }
}
