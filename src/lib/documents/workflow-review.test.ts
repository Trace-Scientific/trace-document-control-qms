import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import {
  WorkflowReviewConflictError,
  WorkflowReviewService,
  type WorkflowReviewStore,
} from "./workflow-review";
const context: AuthorizationContext = {
  userId: "reviewer-1",
  organizationId: "org-1",
  userState: "ACTIVE",
  grants: [
    { permission: "document.review", scopeType: "ORGANIZATION", scopeId: null },
    {
      permission: "document.review.manage",
      scopeType: "ORGANIZATION",
      scopeId: null,
    },
  ],
};
function fixture(
  result:
    | "NEXT_REVIEW"
    | "AWAITING_APPROVAL"
    | "RETURNED_TO_DRAFT"
    | null = "NEXT_REVIEW",
) {
  const decisions: unknown[] = [];
  const store: WorkflowReviewStore = {
    async decide(input) {
      decisions.push(input);
      return result;
    },
    async notifyOverdue() {
      return 2;
    },
  };
  return { store, decisions };
}
describe("sequential workflow review", () => {
  it("binds a decision and comment to the authenticated reviewer", async () => {
    const f = fixture();
    await expect(
      new WorkflowReviewService(
        f.store,
        () => new Date("2026-08-25T00:00:00Z"),
      ).decide(context, {
        organizationId: "org-1",
        taskId: "task-1",
        decision: "ACCEPT",
        comment: " Content verified ",
      }),
    ).resolves.toEqual({ result: "NEXT_REVIEW" });
    expect(f.decisions[0]).toMatchObject({
      reviewerUserId: "reviewer-1",
      comment: "Content verified",
    });
  });
  it("rejects stale tasks and blank comments", async () => {
    await expect(
      new WorkflowReviewService(fixture(null).store).decide(context, {
        organizationId: "org-1",
        taskId: "task-1",
        decision: "ACCEPT",
        comment: "Valid",
      }),
    ).rejects.toBeInstanceOf(WorkflowReviewConflictError);
    await expect(
      new WorkflowReviewService(fixture().store).decide(context, {
        organizationId: "org-1",
        taskId: "task-1",
        decision: "ACCEPT",
        comment: " ",
      }),
    ).rejects.toThrow("comment");
  });
  it("creates idempotent overdue notifications through a manager boundary", async () => {
    await expect(
      new WorkflowReviewService(fixture().store).notifyOverdue(
        context,
        "org-1",
      ),
    ).resolves.toEqual({ created: 2 });
  });
});
