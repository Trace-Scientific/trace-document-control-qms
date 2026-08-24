# Prompt 006 — Document Control Workspace UI

## Objective

Deliver the first usable, responsive Document Control workspace on top of the secured Prompt 005 command boundary.

## Scope

- application shell and primary navigation
- document dashboard with status, version, owner, effective date, and review due date
- search and status filtering
- create-draft interaction with required controlled metadata
- review queue and recent controlled activity
- accessible responsive behavior for desktop, tablet, and mobile
- explicit preview-data labeling until organization onboarding and login are implemented

## Guardrails

- never expose a destructive delete action for controlled documents
- do not imply that visual status is audit evidence
- lifecycle actions remain server-authorized
- no compliance-certification claims
- do not collect or display PHI

## Definition of done

The production build, typecheck, lint, and tests pass; keyboard/focus behavior and responsive layout are reviewed; no secrets or sensitive data are introduced; and the UI is delivered through a scoped pull request.
