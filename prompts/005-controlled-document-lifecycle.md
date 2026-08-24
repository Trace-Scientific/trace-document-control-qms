# Prompt 005 — Controlled Document Lifecycle and API Foundation

## Objective

Implement the first functional QMS domain boundary: tenant-isolated controlled-document commands with explicit lifecycle rules, optimistic concurrency, workflow evidence, and append-only auditing.

## Required scope

1. Create document identities and immutable draft revisions.
2. Enforce `DRAFT → IN_REVIEW → APPROVED → EFFECTIVE → SUPERSEDED` transitions.
3. Permit rejection only from review and return the version to draft with a reason.
4. Require explicit server-side permissions for every command.
5. Bind every lookup and mutation to the authenticated organization.
6. Require an expected lock version for every state-changing command.
7. Create workflow/audit evidence atomically with lifecycle changes.
8. Make a newly effective version the document's current version and supersede the prior effective version atomically.
9. Preserve content hashes and historical versions.

## Required tests

- invalid and skipped transitions are rejected
- missing permissions and cross-tenant requests are rejected
- stale lock versions are rejected
- rejection requires a reason
- effective history cannot be edited or deleted
- supersession is the only permitted mutation of an effective version
- version numbers, revision labels, and hashes are validated
- lifecycle mutations produce audit evidence

## Exclusions

- rich-text editing and object-storage upload UI
- electronic-signature execution and reauthentication UI
- acknowledgment assignment
- notification delivery
- compliance-certification claims

## Definition of done

Migration and database integrity tests pass on PostgreSQL; domain and adversarial tests pass; typecheck, lint, dependency audit, and production build pass; and a scoped pull request documents the security and lifecycle boundary.
