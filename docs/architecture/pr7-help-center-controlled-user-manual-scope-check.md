# PR 7 Scope Check — Help Center & Controlled User Manual

## Included

- Searchable authenticated Help Center read surfaces.
- Help categories, articles, append-only revisions, publication/archive lifecycle, and event history.
- Published-revision pinning so draft revisions cannot silently replace user-visible content.
- Controlled User Manual, sections, append-only section revisions, release snapshots, effective dates, applicability, release notes, publication/archive lifecycle, and event history.
- Database immutability controls for historical revisions/events and published release configuration.
- Optimistic locking for governed lifecycle changes.
- `platform.help.manage` authorization and platform audit for authoring actions.
- `/help` user surface and Platform Administration Help foundation.
- Authenticated reads only; future-effective manual releases are withheld until effective.
- Regression/security tests and architecture documentation.

## Explicitly excluded

- Platform notifications and commercial/operational reporting (PR 8).
- Platform system-health backend (PR 9).
- Integration framework/provider adapters (PR 10+).
- Billing, accounting, CRM, payroll, or other vendor integrations.
- Tenant RBAC changes.
- Cross-tenant regulated-content search/reporting.
- Destructive deletion or rewriting of published/manual history.

## Validation boundary

Railway remains synthetic-data development preview only. Protected qualification/production remains under the governed AWS release path.

## Acceptance guardrail

A new draft article revision or future manual release must never become visible merely because it exists. User-facing content changes only through the governed publication/effective-date lifecycle.
