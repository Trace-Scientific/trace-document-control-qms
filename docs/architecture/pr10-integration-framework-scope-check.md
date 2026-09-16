# PR 10 Integration Framework — Scope Check

Status: implementation scope record

## Included

- Separate platform integration connection metadata and lifecycle.
- Opaque external credential references only; no provider credential values in platform tables.
- Vendor-neutral adapter and credential-resolver contracts.
- Shared runtime adapter registry, intentionally empty in PR 10.
- Durable outbound integration delivery with connection-scoped idempotency.
- PostgreSQL `FOR UPDATE SKIP LOCKED` worker claims, abandoned-lease recovery, bounded retry, and five-attempt dead-lettering.
- Delivery monitoring and explicit reasoned dead-letter replay with platform audit.
- Generic inbound webhook boundary that delegates authenticity verification and normalization to the registered adapter.
- Connection-scoped inbound idempotency, raw-body SHA-256 evidence, and append-only normalized event history.
- Platform Administration Integrations workspace.
- Platform System Health integration telemetry.
- Regression/security tests and architecture documentation.

## Security boundary

- `platform.integration.manage` is the platform administration permission; no tenant role satisfies it.
- Platform integration records do not grant tenant QMS permissions.
- External providers never become authorization authorities.
- Connections cannot become ACTIVE unless their adapter is registered in the reviewed runtime composition.
- Raw provider secrets are resolved outside application data through `PlatformCredentialResolver`.
- Inbound normalized events are created only after adapter verification succeeds.
- Duplicate inbound receipts are suppressed through connection-scoped idempotency.

## Explicit exclusions

- Stripe, Salesforce, QuickBooks, Office Ally, Twilio, SendGrid, or any other provider-specific adapter.
- Provider credentials or secret-management backend implementation.
- Billing/accounting/CRM/payroll provider business logic.
- Tenant QMS integration authority changes.
- Provider-triggered electronic signatures, approvals, role assignments, or other accountable-user acts.
- Cross-tenant regulated-content export/reporting.

## Validation boundary

Railway remains synthetic-data development preview only. No production provider credentials or regulated customer content are permitted in preview. Protected validation/production remains governed by the AWS release process.
