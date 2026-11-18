type Revision = {
  documentNumber: string;
  revisionLabel: string;
  title: string;
};
type Assignee = { id: string; name: string };

export function buildSubmissionReceipt(input: {
  revision: Revision;
  firstReviewerId?: string;
  reviewers: Assignee[];
  approverId: string;
  approvers: Assignee[];
  stageCount: number;
}) {
  const { revision, firstReviewerId, reviewers, approverId, approvers, stageCount } = input;
  const approver = approvers.find(({ id }) => id === approverId)?.name;
  const nextAssignee = firstReviewerId
    ? reviewers.find(({ id }) => id === firstReviewerId)?.name
    : approver;

  return {
    revision: `${revision.documentNumber} · v${revision.revisionLabel} · ${revision.title}`,
    nextStep: firstReviewerId ? "Technical review" : "Final approval",
    nextAssignee,
    laterApprover: firstReviewerId ? approver : undefined,
    stageCount,
  };
}
