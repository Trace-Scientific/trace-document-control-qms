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
    async correctLastReview() { return true; },
    async notifyOverdue() {
      return 2;
    },
    async notifyAllOverdue() {
      return 2;
    },
    async transfer() {
      return true;
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
  it("allows a manager to correct the last active review with a reason", async () => {
    await expect(new WorkflowReviewService(fixture().store).correctLastReview(context, {
      organizationId: "org-1", taskId: "task-2", reason: "Approver assigned as reviewer by mistake",
    })).resolves.toEqual({ result: "AWAITING_APPROVAL" });
  });
  it("denies correction without review-management authorization or across tenants", async () => {
    const service = new WorkflowReviewService(fixture().store);
    await expect(service.correctLastReview({ ...context, grants: [] }, {
      organizationId: "org-1", taskId: "task-2", reason: "Correction",
    })).rejects.toThrow("Access denied");
    await expect(service.correctLastReview(context, {
      organizationId: "org-2", taskId: "task-2", reason: "Correction",
    })).rejects.toThrow("Access denied");
    await expect(service.correctLastReview(context, {
      organizationId: "org-1", taskId: "task-2", reason: " ",
    })).rejects.toThrow("reason");
  });
  it("passes a trimmed correction reason and the authenticated actor to the store", async () => {
    const received: unknown[] = [];
    const base = fixture().store;
    const store: WorkflowReviewStore = {
      ...base,
      async correctLastReview(input) {
        received.push(input);
        return true;
      },
    };
    await new WorkflowReviewService(store, () => new Date("2026-11-16T00:00:00Z"))
      .correctLastReview(context, {
        organizationId: "org-1",
        taskId: "task-2",
        reason: "  Incorrect reviewer assignment  ",
      });
    expect(received).toEqual([{
      organizationId: "org-1",
      taskId: "task-2",
      reason: "Incorrect reviewer assignment",
      actorUserId: "reviewer-1",
      occurredAt: new Date("2026-11-16T00:00:00Z"),
    }]);
  });
  it("rejects stale or already-corrected review stages", async () => {
    const store: WorkflowReviewStore = {
      ...fixture().store,
      async correctLastReview() { return false; },
    };
    await expect(new WorkflowReviewService(store).correctLastReview(context, {
      organizationId: "org-1",
      taskId: "task-2",
      reason: "Correction",
    })).rejects.toBeInstanceOf(WorkflowReviewConflictError);
  });
  it("creates idempotent overdue notifications through a manager boundary", async () => {
    await expect(
      new WorkflowReviewService(fixture().store).notifyOverdue(
        context,
        "org-1",
      ),
    ).resolves.toEqual({ created: 2 });
  });
  it("denies cross-tenant review transfers before invoking the store", async () => {
    let invoked = false;
    const store: WorkflowReviewStore = {
      ...fixture().store,
      async transfer() {
        invoked = true;
        return true;
      },
    };
    await expect(new WorkflowReviewService(store).transfer(context, {
      organizationId: "org-2",
      taskId: "task-1",
      newAssigneeUserId: "reviewer-2",
      reason: "Coverage",
      mode: "REASSIGN",
    })).rejects.toThrow("Access denied");
    expect(invoked).toBe(false);
  });
  it("requires management permission for reassignment but allows reviewer delegation", async () => {
    const reviewerOnly = {
      ...context,
      grants: [{ permission: "document.review", scopeType: "ORGANIZATION" as const, scopeId: null }],
    };
    const service = new WorkflowReviewService(fixture().store);
    await expect(service.transfer(reviewerOnly, {
      organizationId: "org-1",
      taskId: "task-1",
      newAssigneeUserId: "reviewer-2",
      reason: "Coverage",
      mode: "REASSIGN",
    })).rejects.toThrow("Access denied");
    await expect(service.transfer(reviewerOnly, {
      organizationId: "org-1",
      taskId: "task-1",
      newAssigneeUserId: "reviewer-2",
      reason: "Coverage",
      mode: "DELEGATE",
    })).resolves.toBeUndefined();
  });
  it("rejects stale transfer tasks and self-assignment", async () => {
    const store: WorkflowReviewStore = {
      ...fixture().store,
      async transfer() { return false; },
    };
    const service = new WorkflowReviewService(store);
    await expect(service.transfer(context, {
      organizationId: "org-1",
      taskId: "task-1",
      newAssigneeUserId: "reviewer-2",
      reason: "Coverage",
      mode: "REASSIGN",
    })).rejects.toBeInstanceOf(WorkflowReviewConflictError);
    await expect(service.transfer(context, {
      organizationId: "org-1",
      taskId: "task-1",
      newAssigneeUserId: "reviewer-1",
      reason: "Coverage",
      mode: "DELEGATE",
    })).rejects.toThrow("new reviewer");
  });
  it("supports manager reassignment and reviewer delegation with a reason", async () => {
    await expect(
      new WorkflowReviewService(fixture().store).transfer(context, {
        organizationId: "org-1",
        taskId: "task-1",
        newAssigneeUserId: "reviewer-2",
        reason: "Coverage during leave",
        mode: "REASSIGN",
      }),
    ).resolves.toBeUndefined();
    await expect(
      new WorkflowReviewService(fixture().store).transfer(context, {
        organizationId: "org-1",
        taskId: "task-1",
        newAssigneeUserId: "reviewer-2",
        reason: " ",
        mode: "DELEGATE",
      }),
    ).rejects.toThrow("reason");
  });
});
