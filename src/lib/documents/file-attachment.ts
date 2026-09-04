import { requireAuthorization, type AuthorizationContext } from "../security/authorization";

export type AttachableFile = {
  id: string;
  organizationId: string;
  status: "PENDING_SCAN" | "AVAILABLE" | "QUARANTINED" | "ARCHIVED";
  sha256: string;
  originalName: string;
};

export type AttachableVersion = {
  id: string;
  organizationId: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "EFFECTIVE" | "SUPERSEDED" | "RETIRED";
  lockVersion: number;
  fileId: string | null;
};

export interface DocumentFileAttachmentStore {
  findVersion(organizationId: string, versionId: string): Promise<AttachableVersion | null>;
  findFile(organizationId: string, fileId: string): Promise<AttachableFile | null>;
  attach(input: {
    organizationId: string;
    versionId: string;
    fileId: string;
    expectedLockVersion: number;
    actorUserId: string;
    sha256: string;
    originalName: string;
    occurredAt: Date;
  }): Promise<boolean>;
}

export class DocumentFileAttachmentService {
  constructor(
    private readonly store: DocumentFileAttachmentStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async attach(
    context: AuthorizationContext,
    input: { organizationId: string; versionId: string; fileId: string; expectedLockVersion: number },
  ) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "document.create" });
    if (!Number.isSafeInteger(input.expectedLockVersion) || input.expectedLockVersion < 0)
      throw new DocumentFileAttachmentError("Invalid lock version");
    const version = await this.store.findVersion(input.organizationId, input.versionId);
    if (!version) throw new Error("Access denied");
    if (version.status !== "DRAFT") throw new DocumentFileAttachmentError("Files can only be attached to draft revisions");
    if (version.lockVersion !== input.expectedLockVersion) throw new DocumentFileAttachmentConcurrencyError();
    if (version.fileId) throw new DocumentFileAttachmentError("The draft already has a controlled file");
    const file = await this.store.findFile(input.organizationId, input.fileId);
    if (!file) throw new Error("Access denied");
    if (file.status !== "AVAILABLE") throw new DocumentFileAttachmentError("Only available files can be attached");
    const changed = await this.store.attach({
      ...input,
      actorUserId: context.userId,
      sha256: file.sha256,
      originalName: file.originalName,
      occurredAt: this.clock(),
    });
    if (!changed) throw new DocumentFileAttachmentConcurrencyError();
    return { versionId: version.id, fileId: file.id, status: "ATTACHED" as const, lockVersion: version.lockVersion + 1, sha256: file.sha256 };
  }
}

export class DocumentFileAttachmentError extends Error {
  constructor(message: string) { super(message); this.name = "DocumentFileAttachmentError"; }
}
export class DocumentFileAttachmentConcurrencyError extends Error {
  constructor() { super("The document version changed; reload before retrying"); this.name = "DocumentFileAttachmentConcurrencyError"; }
}
