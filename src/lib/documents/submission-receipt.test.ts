import { describe, expect, it } from "vitest";
import { buildSubmissionReceipt } from "./submission-receipt";

const input = {
  revision: { documentNumber: "FRM-002", revisionLabel: "0.3", title: "Maintenance log" },
  reviewers: [{ id: "reviewer", name: "Technical reviewer" }],
  approverId: "approver",
  approvers: [{ id: "approver", name: "Final approver" }],
};

describe("buildSubmissionReceipt", () => {
  it("shows the submitted revision and its first technical reviewer", () => {
    expect(buildSubmissionReceipt({
      ...input, firstReviewerId: "reviewer", stageCount: 2,
    })).toEqual({
      revision: "FRM-002 · v0.3 · Maintenance log",
      nextStep: "Technical review",
      nextAssignee: "Technical reviewer",
      laterApprover: "Final approver",
      stageCount: 2,
    });
  });

  it("shows the final approver as next for a direct approval route", () => {
    expect(buildSubmissionReceipt({ ...input, stageCount: 0 })).toEqual({
      revision: "FRM-002 · v0.3 · Maintenance log",
      nextStep: "Final approval",
      nextAssignee: "Final approver",
      laterApprover: undefined,
      stageCount: 0,
    });
  });

  it("leaves an unavailable display name blank instead of guessing", () => {
    expect(buildSubmissionReceipt({
      ...input, firstReviewerId: "unavailable", stageCount: 1,
    }).nextAssignee).toBeUndefined();
  });
});
