type PriorAssignment = {
  stepKey: string;
  assignee: { id: string } | null;
};

export function suggestPriorReviewers(
  assignments: PriorAssignment[],
  eligibleReviewers: { id: string }[],
): string[] | null {
  const eligibleIds = new Set(eligibleReviewers.map(({ id }) => id));
  const stages = assignments
    .filter(({ stepKey }) => stepKey.startsWith("REVIEW_"))
    .map(({ stepKey, assignee }) => ({
      position: Number(/^REVIEW_([1-9]|10)$/.exec(stepKey)?.[1]),
      reviewerId: assignee?.id ?? "",
    }))
    .sort((a, b) => a.position - b.position);

  const reviewerIds = stages.map(({ reviewerId }) => reviewerId);
  if (
    stages.some(({ position, reviewerId }, index) =>
      position !== index + 1 || !eligibleIds.has(reviewerId)
    ) ||
    new Set(reviewerIds).size !== reviewerIds.length
  ) {
    return null;
  }
  return reviewerIds;
}
