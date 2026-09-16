# PR 8 Scope Check — Platform Notifications & Reporting

## Included

- Platform-scoped notification recipients based on `PlatformIdentity`.
- Durable notification state with retry/backoff, five-attempt dead-lettering, lease recovery, and `FOR UPDATE SKIP LOCKED` worker claims.
- Append-only notification event history.
- In-app delivery transport plus fail-safe unconfigured email transport boundary.
- Platform inbox constrained to the authenticated platform identity.
- Delivery monitoring and explicit reasoned dead-letter requeue controls.
- Dedicated `platform.notification.read`, `platform.notification.manage`, and `platform.reporting.read` permissions.
- Commercial/operational aggregates for customers, subscriptions, entitlement overrides, support activity, sales attribution, commission status, and platform notification delivery.
- Append-only `PlatformReportRun` snapshots.
- Platform Administration Notifications and Reporting workspaces.
- Regression/security tests and architecture documentation.

## Security and governance controls

- Tenant `AuthorizationContext` is unchanged.
- No platform notification uses a fake tenant `Organization` for ownership.
- Platform roles do not become tenant roles.
- Tenant roles do not grant platform notification/reporting permissions.
- Report queries do not read tenant documents, regulated records, quality events, training data, or other regulated tenant content.
- Dead-letter requeue requires explicit platform authorization and a reason and produces append-only event/audit evidence.
- Provider-backed delivery is not represented as operational before a provider exists.

## Explicit exclusions

- Tenant QMS notification workflow changes.
- Tenant or cross-tenant regulated-content reporting.
- Platform system-health implementation (PR 9).
- Integration framework/provider adapters (PR 10+).
- Email/SMS provider credentials or configuration.
- Scheduled report distribution.
- Billing/accounting/CRM/payroll integrations.

## Validation boundary

Railway remains synthetic-data development preview only. Protected qualification/production remains under the governed AWS release path.
