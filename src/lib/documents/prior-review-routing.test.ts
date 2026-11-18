import { describe, expect, it } from "vitest";
import { suggestPriorReviewers } from "./prior-review-routing";

const reviewers = [{ id: "one" }, { id: "two" }, { id: "three" }];
const assignment = (stepKey: string, id: string) => ({
  stepKey,
  assignee: { id },
});

describe("suggestPriorReviewers", () => {
  it("preserves the order of all still-eligible prior technical reviewers", () => {
    expect(suggestPriorReviewers([
      assignment("REVIEW_3", "three"),
      assignment("APPROVAL", "four"),
      assignment("REVIEW_1", "one"),
      assignment("REVIEW_2", "two"),
    ], reviewers)).toEqual(["one", "two", "three"]);
  });

  it("keeps approval-only routes empty", () => {
    expect(suggestPriorReviewers([assignment("APPROVAL", "one")], reviewers)).toEqual([]);
  });

  it("leaves the route for manual confirmation when the prior stages cannot be reused intact", () => {
    for (const assignments of [
      [assignment("REVIEW_1", "one"), assignment("REVIEW_2", "ineligible")],
      [assignment("REVIEW_1", "one"), assignment("REVIEW_1", "two")],
      [assignment("REVIEW_1", "one"), assignment("REVIEW_2", "one")],
      [assignment("REVIEW_2", "two")],
      [{ stepKey: "REVIEW_1", assignee: null }],
      [assignment("REVIEW_OLD", "one")],
    ]) {
      expect(suggestPriorReviewers(assignments, reviewers)).toBeNull();
    }
  });
});
