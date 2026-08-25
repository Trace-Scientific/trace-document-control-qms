import { describe, expect, it } from "vitest";
import { reviewStageSelectionsAreValid } from "./workflow-ui";

describe("workflow stage builder", () => {
  it("accepts unique reviewers with custom stage deadlines", () => {
    expect(
      reviewStageSelectionsAreValid(
        [
          { reviewerUserId: "reviewer-1", dueAt: "2026-09-01" },
          { reviewerUserId: "reviewer-2", dueAt: "2026-09-05" },
        ],
        false,
      ),
    ).toBe(true);
  });
  it("rejects duplicate reviewers and missing custom deadlines", () => {
    expect(
      reviewStageSelectionsAreValid(
        [
          { reviewerUserId: "reviewer-1", dueAt: "2026-09-01" },
          { reviewerUserId: "reviewer-1", dueAt: "" },
        ],
        false,
      ),
    ).toBe(false);
  });
  it("allows templates to supply deadlines", () => {
    expect(
      reviewStageSelectionsAreValid(
        [{ reviewerUserId: "reviewer-1", dueAt: "" }],
        true,
      ),
    ).toBe(true);
  });
});
