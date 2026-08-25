# Prompt 017 — Workflow administration interface

## Objective

Expose the Prompt 016 workflow controls through accessible, permission-aware
dashboard interfaces while preserving server-side validation as the authority.

## Delivered scope

- Workflow-template administration in the Administration view.
- Creation of one-to-ten-stage immutable template versions.
- Activation and deactivation with a mandatory audit reason.
- Ordered review-stage builder with unique reviewers and per-stage deadlines.
- Active-template selection that derives deadlines on the server.
- Eligible-reviewer selectors for controlled manager reassignment and active
  reviewer delegation.
- Responsive layouts, explicit labels, disabled submission states, and inline
  error feedback.
- An hourly, manually runnable GitHub Actions monitor calls the authenticated
  overdue endpoint and fails closed until its deployment URL and secret exist.

## Acceptance checks

- Stage-builder validation rejects incomplete or duplicate assignments.
- Existing tenant, permission, concurrency, and audit boundaries remain server
  enforced.
- TypeScript, ESLint, Vitest, and the production Next.js build pass.
