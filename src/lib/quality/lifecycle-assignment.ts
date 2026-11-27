type Assignment = {
  ownerUserId: string | null;
  dueAt: string | null;
};

export function getLifecycleAssignmentChanges(
  current: Assignment,
  draft: Partial<Assignment>,
): Partial<Assignment> {
  const changes: Partial<Assignment> = {};
  if (draft.ownerUserId !== undefined && draft.ownerUserId !== current.ownerUserId) {
    changes.ownerUserId = draft.ownerUserId;
  }
  const currentDueDate = current.dueAt?.slice(0, 10) ?? null;
  if (draft.dueAt !== undefined && draft.dueAt !== currentDueDate) {
    changes.dueAt = draft.dueAt;
  }
  return changes;
}
