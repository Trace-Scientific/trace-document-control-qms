# Prompt 013 — Document detail, editing, comparison, and lifecycle UI

## Goal

Provide an authenticated document-detail workspace that preserves controlled-content integrity while allowing authorized users to edit drafts, compare versions, and perform state-valid lifecycle actions.

## Delivered behavior

- `GET /api/documents/[versionId]` derives the tenant from the authenticated session, requires `document.read`, and returns the selected version plus its document history.
- Detail responses include controlled text, SHA-256 evidence, revision metadata, lifecycle status, lock version, author, and review dates.
- Draft editing requires `document.create`, accepts an expected lock version, computes the content hash on the server, and writes an append-only `DOCUMENT_DRAFT_UPDATED` audit event.
- Stale saves and edits to non-draft versions fail through the same conflict boundary.
- The detail workspace presents stored content, change summaries, version history, and side-by-side comparison.
- Lifecycle controls are displayed only when both the version state and permission allow the action.
- Submit, reject, and make-effective actions use the existing controlled transition service.
- Approval uses the existing electronic-signature service and requires password reauthentication plus explicit confirmation.
- Creation, editing, transitions, and approval no longer accept a browser-selected organization identifier; the API derives it from the session.

## Compliance and security boundaries

- Historical and effective content remains database-protected against mutation.
- Draft changes use optimistic locking to prevent lost updates.
- Approval signatures remain bound to the exact document content hash and revision.
- Rejection requires a reason, and all lifecycle transitions retain existing audit evidence.
- Plain-text content is rendered as text, not executable markup.

## Deferred

- Rich-text authoring, attachments, redlined semantic diffs, and collaborative editing.
- Creating a successor revision from an effective version.
- Dedicated workflow-task assignment and reviewer comment screens.
