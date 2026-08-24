# Prompt 014 — Successor revisions, review assignments, and redlines

## Goal

Extend controlled-document authoring with traceable successor revisions, revision-specific reviewer assignment, durable reviewer instructions/comments, and a deterministic redlined comparison.

## Delivered behavior

- Authorized authors can create a successor draft from an effective or superseded source version.
- The server derives the next internal version number, computes the SHA-256 digest, preserves the source-version link in audit metadata, and rejects creation while another revision is in process.
- Draft submission can assign an eligible active reviewer from the same tenant, set a future due date, and record review instructions.
- Reviewer eligibility is verified again inside the database transaction against `document.review` or `document.approve` grants.
- Workflow tasks remain bound to one document-version workflow instance and expose assignment status, due date, decision, and comments in document detail.
- The detail workspace displays revision-specific review history.
- Version comparison now uses a deterministic line-level redline with added, removed, and unchanged content.

## Compliance and security boundaries

- Organization context is derived from the authenticated session.
- Successor creation requires `document.create`; submission requires `document.submit`.
- Source versions must be controlled effective or historical versions within the same tenant.
- Only one draft, in-review, or approved successor may exist for a document at a time.
- Review due dates are validated as future dates by the command service.
- Assignment, source revision, content hash, and lifecycle evidence are retained in append-only audit metadata.

## Deferred

- Parallel multi-reviewer and sequential approval stages.
- Rich-text semantic redlines and inline annotations.
- Email/calendar delivery for assignment due dates.
