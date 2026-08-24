import { requireAuthorization, type AuthorizationContext } from "../security/authorization";

export type ReviewOutcome = "NO_CHANGE" | "REVISION_REQUIRED" | "RETIREMENT_REQUIRED";
export interface DueReview { id: string; documentId: string; documentVersionId: string; documentNumber?: string; title?: string; revisionLabel?: string; dueAt: Date; }
export interface ReviewStore {
  listDue(organizationId: string, through: Date): Promise<DueReview[]>;
  escalate(input: { organizationId: string; taskId: string; level: number; eventKey: string; occurredAt: Date }): Promise<boolean>;
  complete(input: { organizationId: string; taskId: string; actorUserId: string; outcome: ReviewOutcome; comments: string; completedAt: Date }): Promise<boolean>;
  listOutstanding(organizationId: string, now: Date): Promise<Array<DueReview & { overdue: boolean }>>;
}

export class DocumentReviewService {
  constructor(private readonly store: ReviewStore, private readonly clock: () => Date = () => new Date()) {}
  async monitor(context: AuthorizationContext, organizationId: string) {
    requireAuthorization(context, { organizationId, permission: "document.review.manage" });
    const now = this.clock();
    const tasks = await this.store.listDue(organizationId, now);
    let escalated = 0;
    for (const task of tasks) {
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - task.dueAt.getTime()) / 86_400_000));
      const level = daysOverdue >= 30 ? 3 : daysOverdue >= 7 ? 2 : 1;
      if (await this.store.escalate({ organizationId, taskId: task.id, level, eventKey: `document-review:${task.id}:level:${level}`, occurredAt: now })) escalated++;
    }
    return { evaluated: tasks.length, escalated };
  }
  async complete(context: AuthorizationContext, input: { organizationId: string; taskId: string; outcome: ReviewOutcome; comments: string }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "document.review.complete" });
    if (input.comments.trim().length < 3) throw new ReviewValidationError("Review comments are required");
    const completed = await this.store.complete({ ...input, comments: input.comments.trim(), actorUserId: context.userId, completedAt: this.clock() });
    if (!completed) throw new ReviewConflictError();
    return { completed: true };
  }
  async listOutstanding(context: AuthorizationContext, organizationId: string) {
    requireAuthorization(context, { organizationId, permission: "document.review.manage" });
    return this.store.listOutstanding(organizationId, this.clock());
  }
}
export class ReviewValidationError extends Error {}
export class ReviewConflictError extends Error { constructor() { super("The review task changed; reload before retrying"); } }
