# Prompt 015 — Sequential review workflows and overdue notifications

## Goal

Support configurable ordered reviewer stages for each document revision, bind decisions to the active assignee, prevent premature approval, and generate idempotent overdue notifications.

## Delivered behavior

- Draft submission accepts one to ten unique reviewers in stage order.
- Reviewer eligibility is verified transactionally against active same-tenant users holding `document.review` or `document.approve`.
- Each reviewer receives a version-bound workflow task; only the first stage begins in progress.
- Assignment and stage-ready events create recipient-specific notification-outbox records.
- Only the authenticated assignee of the active stage can accept it or request changes.
- Acceptance completes the current task and activates the next reviewer stage.
- After the last reviewer accepts, the workflow enters `APPROVAL` and creates a distinct approval task.
- Electronic approval is rejected unless the workflow is in the approval stage and the approval task is actionable.
- A request-changes decision records the reviewer comment, cancels later stages, completes the workflow, and returns the revision to draft.
- Administrators can run an idempotent overdue monitor that queues recipient-specific notifications and audit evidence for overdue active review stages.
- Document detail displays ordered task keys, assignees, status, due dates, decisions, and comments, with decision controls only for the signed-in active assignee.

## Compliance and security boundaries

- Tenant identity is session-derived at every route.
- Generic direct rejection was removed from the public document-command API; requested changes must use the assigned workflow task.
- Task decisions use status and assignee predicates to prevent stale, out-of-order, or unauthorized actions.
- Approval cannot bypass incomplete reviewer stages.
- Notification event keys make assignment, stage-ready, and overdue delivery idempotent.
- Every decision and overdue-notification creation writes append-only audit evidence.

## Deferred

- Per-stage due dates and workflow templates managed through an administration screen.
- Delegation, reassignment, and absence coverage.
- Scheduled invocation of the overdue monitor in production infrastructure.
