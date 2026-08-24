# Prompt 016 — Workflow template administration, delegation, and automation

## Objective

Make sequential document review workflows reusable and operationally manageable
without weakening tenant isolation, authorization, auditability, or concurrency
controls.

## Delivered scope

- Versioned workflow-template administration over the existing
  `WorkflowDefinition` model.
- One active version per organization and template key; prior definitions remain
  immutable history.
- Validated one-to-ten-stage template definitions with a one-to-365-day target
  for each stage.
- Stage-specific reviewer due dates on document submission, with backward
  compatibility for the prior shared-date request shape.
- Manager reassignment of pending or active review tasks.
- Active-reviewer delegation of their own in-progress task.
- Same-organization, active-user, `document.review` eligibility checks for every
  transfer.
- Reason-required, auditable transfer and template-state actions.
- Idempotent assignment notifications for transferred tasks.
- Fail-closed, secret-authenticated overdue-monitor endpoint suitable for a
  hosting scheduler.

## API surface

- `GET /api/documents/workflow/templates`
- `POST /api/documents/workflow/templates`
  - `CREATE_VERSION`
  - `SET_ACTIVE`
- `POST /api/documents/workflow`
  - `REASSIGN`
  - `DELEGATE`
- `POST /api/internal/review-overdue`

## Security and compliance decisions

- Organization identity always comes from the authenticated session.
- Template administration and reassignment require
  `document.review.manage`.
- Delegation requires `document.review` and ownership of the active task.
- Template versions are appended instead of overwritten.
- All material actions generate immutable audit events.
- The scheduler endpoint reveals no authorization detail and is disabled unless
  a strong secret is configured.

## Acceptance checks

- TypeScript type checking passes.
- ESLint passes.
- The complete Vitest suite passes, including template validation, task transfer,
  stage-specific deadlines, and cron authentication.
- The production Next.js build succeeds.
