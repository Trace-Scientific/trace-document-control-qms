export interface ReviewStageSelection {
  reviewerUserId: string;
  dueAt: string;
}

export function reviewStageSelectionsAreValid(
  stages: ReviewStageSelection[],
  templateSelected: boolean,
) {
  const reviewers = stages.map((stage) => stage.reviewerUserId);
  return (
    stages.length >= 1 &&
    stages.length <= 10 &&
    reviewers.every(Boolean) &&
    new Set(reviewers).size === reviewers.length &&
    (templateSelected || stages.every((stage) => Boolean(stage.dueAt)))
  );
}
