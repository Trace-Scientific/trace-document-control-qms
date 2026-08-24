import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";
import { verifyPassword } from "../security/crypto";
import { hashAcknowledgmentPayload, type AcknowledgmentPayload } from "./payload";

export interface AssignmentEvidence extends Omit<AcknowledgmentPayload, "signedAt"> { passwordHash: string; assignmentStatus: string; documentStatus: string; recipientStatus: string; }
export interface AcknowledgmentStore {
  assign(input: { organizationId: string; versionId: string; recipientUserIds: string[]; assignedByUserId: string; dueAt: Date; assignedAt: Date }): Promise<{ created: number }>;
  loadAssignment(organizationId: string, assignmentId: string, userId: string): Promise<AssignmentEvidence | null>;
  recentFailures(organizationId: string, userId: string, since: Date): Promise<number>;
  recordFailure(evidence: AssignmentEvidence, at: Date): Promise<void>;
  complete(input: AcknowledgmentPayload & { payloadHash: string; authenticationValidUntil: Date }): Promise<{ completionId: string } | null>;
  listOutstanding(organizationId: string, now: Date): Promise<Array<{ assignmentId: string; documentVersionId: string; recipientUserId: string; dueAt: Date | null; overdue: boolean }>>;
}

export class AcknowledgmentService {
  constructor(private readonly store: AcknowledgmentStore, private readonly clock: () => Date = () => new Date()) {}
  async assign(context: AuthorizationContext, input: { organizationId: string; versionId: string; recipientUserIds: string[]; dueAt: Date }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "document.distribute" });
    const now = this.clock();
    const recipients = [...new Set(input.recipientUserIds)];
    if (!recipients.length || recipients.length !== input.recipientUserIds.length) throw new AcknowledgmentValidationError("Recipients must be unique");
    if (input.dueAt <= now) throw new AcknowledgmentValidationError("Due date must be in the future");
    return this.store.assign({ ...input, recipientUserIds: recipients, assignedByUserId: context.userId, assignedAt: now });
  }
  async listOutstanding(context: AuthorizationContext, organizationId: string) {
    requireAuthorization(context, { organizationId, permission: "document.distribute" });
    return this.store.listOutstanding(organizationId, this.clock());
  }
  async complete(context: AuthorizationContext, input: { organizationId: string; assignmentId: string; password: string; confirmed: boolean }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "document.acknowledge" });
    if (!input.confirmed) throw new AcknowledgmentValidationError("Acknowledgment meaning must be confirmed");
    const evidence = await this.store.loadAssignment(input.organizationId, input.assignmentId, context.userId);
    if (!evidence) throw new Error("Access denied");
    if (evidence.assignmentStatus !== "ASSIGNED" || evidence.documentStatus !== "EFFECTIVE" || evidence.recipientStatus !== "ACTIVE") throw new AcknowledgmentValidationError("Assignment is not eligible for completion");
    const now = this.clock();
    if (await this.store.recentFailures(evidence.organizationId, evidence.userId, new Date(now.getTime() - 15 * 60 * 1000)) >= 5) throw new AcknowledgmentThrottledError();
    if (!verifyPassword(input.password, evidence.passwordHash)) { await this.store.recordFailure(evidence, now); throw new AcknowledgmentReauthenticationError(); }
    const payload = { organizationId: evidence.organizationId, userId: evidence.userId, assignmentId: evidence.assignmentId, documentId: evidence.documentId, documentVersionId: evidence.documentVersionId, revisionLabel: evidence.revisionLabel, contentHash: evidence.contentHash, signedAt: now };
    const result = await this.store.complete({ ...payload, payloadHash: hashAcknowledgmentPayload(payload), authenticationValidUntil: new Date(now.getTime() + 5 * 60 * 1000) });
    if (!result) throw new AcknowledgmentConflictError();
    return { ...result, completedAt: now };
  }
}
export class AcknowledgmentValidationError extends Error {}
export class AcknowledgmentConflictError extends Error { constructor() { super("The assignment changed; reload before acknowledging"); } }
export class AcknowledgmentReauthenticationError extends Error { constructor() { super("Reauthentication failed"); } }
export class AcknowledgmentThrottledError extends Error { constructor() { super("Too many reauthentication attempts"); } }
