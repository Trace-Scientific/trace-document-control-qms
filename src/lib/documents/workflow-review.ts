import {
  requireAuthorization,
  type AuthorizationContext,
} from "../security/authorization";
export type ReviewerDecision = "ACCEPT" | "REQUEST_CHANGES";
export interface WorkflowReviewStore {
  decide(input: {
    organizationId: string;
    taskId: string;
    reviewerUserId: string;
    decision: ReviewerDecision;
    comment: string;
    occurredAt: Date;
  }): Promise<"NEXT_REVIEW" | "AWAITING_APPROVAL" | "RETURNED_TO_DRAFT" | null>;
  notifyOverdue(organizationId: string, occurredAt: Date): Promise<number>;
  notifyAllOverdue(occurredAt: Date): Promise<number>;
  transfer(input: {
    organizationId: string;
    taskId: string;
    actorUserId: string;
    newAssigneeUserId: string;
    reason: string;
    mode: "REASSIGN" | "DELEGATE";
    occurredAt: Date;
  }): Promise<boolean>;
}
export class WorkflowReviewService {
  constructor(
    private readonly store: WorkflowReviewStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async decide(
    context: AuthorizationContext,
    input: {
      organizationId: string;
      taskId: string;
      decision: ReviewerDecision;
      comment: string;
    },
  ) {
    requireAuthorization(context, {
      organizationId: input.organizationId,
      permission: "document.review",
    });
    if (!input.comment.trim())
      throw new WorkflowReviewValidationError("A reviewer comment is required");
    const result = await this.store.decide({
      ...input,
      comment: input.comment.trim(),
      reviewerUserId: context.userId,
      occurredAt: this.clock(),
    });
    if (!result) throw new WorkflowReviewConflictError();
    return { result };
  }
  async notifyOverdue(context: AuthorizationContext, organizationId: string) {
    requireAuthorization(context, {
      organizationId,
      permission: "document.review.manage",
    });
    return {
      created: await this.store.notifyOverdue(organizationId, this.clock()),
    };
  }
  async transfer(
    context: AuthorizationContext,
    input: {
      organizationId: string;
      taskId: string;
      newAssigneeUserId: string;
      reason: string;
      mode: "REASSIGN" | "DELEGATE";
    },
  ) {
    requireAuthorization(context, {
      organizationId: input.organizationId,
      permission:
        input.mode === "REASSIGN"
          ? "document.review.manage"
          : "document.review",
    });
    if (!input.reason.trim() || input.newAssigneeUserId === context.userId)
      throw new WorkflowReviewValidationError("A new reviewer and reason are required");
    const changed = await this.store.transfer({
      ...input,
      reason: input.reason.trim(),
      actorUserId: context.userId,
      occurredAt: this.clock(),
    });
    if (!changed) throw new WorkflowReviewConflictError();
  }
}
export class WorkflowReviewValidationError extends Error {}
export class WorkflowReviewConflictError extends Error {
  constructor() {
    super("The review task is no longer actionable");
  }
}
