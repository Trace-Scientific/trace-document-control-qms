# Platform Notifications & Reporting

Status: PR 8 implementation architecture record

## Purpose

This increment adds Trace-side notification delivery and commercial/operational reporting without creating a fake tenant organization and without expanding tenant QMS authorization.

## Notification boundary

`PlatformNotification` is a control-plane record addressed to `PlatformIdentity`. It may optionally correlate to a `CustomerAccount`, but it does not use tenant `Organization` as the notification ownership boundary.

Delivery states are:

`PENDING -> PROCESSING -> SENT`

or, after a failed attempt:

`PROCESSING -> RETRY -> ... -> DEAD_LETTER`

Workers claim due notifications with PostgreSQL `FOR UPDATE SKIP LOCKED`. Claims older than five minutes are recovered as retryable work. The delivery ceiling is five attempts with bounded backoff. Delivery errors are length-limited before persistence.

`PlatformNotificationEvent` is append-only. User-created notifications and administrative requeues also write `PlatformAuditEvent` evidence.

## Transport boundary

The worker depends on a channel-specific transport interface. In-app transport is durable once the row reaches `SENT`. Email is intentionally represented by an unavailable transport until a provider is configured under the later integration/provider workstream. Provider configuration is not treated as runtime authorization authority.

No public HTTP endpoint exists to invoke the delivery worker. Scheduling/worker invocation remains deployment-specific.

## Inbox and administrative access

- `platform.notification.read` permits the authenticated platform identity to read only its own delivered in-app notifications and mark them read.
- `platform.notification.manage` permits enqueueing, delivery monitoring, and explicit reasoned requeue of dead letters.
- Requeue resets delivery-attempt state but preserves append-only notification event and platform audit evidence.

## Reporting boundary

`platform.reporting.read` permits generation and review of the control-plane operational/commercial summary. The report aggregates only:

- customer account lifecycle counts;
- subscription lifecycle counts;
- active entitlement overrides;
- support case/request/session activity;
- sales representative and current assignment counts;
- commission accrual status and approved-unpaid commission amount; and
- platform notification delivery state.

The report service does not query tenant documents, regulated records, quality events, training records, signatures, laboratory records, or other regulated tenant content.

Each generated report is stored as an append-only `PlatformReportRun` snapshot containing its report key, parameters, aggregate result, generating platform identity/membership, and generation time. This preserves reproducibility without creating a cross-tenant regulated-content reporting engine.

## Authorization separation

New platform permissions are resolved only through the independent platform RBAC domain. They are not added to tenant `AuthorizationContext`, and tenant grants do not imply notification or reporting authority.

## Operational UI

Platform Administration adds separate Notifications and Reporting workspaces. Notification administrators can monitor delivery state and requeue dead letters with an explicit reason. Reporting readers can generate governed aggregate snapshots and view the latest control-plane summary.

## Deferred work

The following remain outside PR 8:

- provider-backed email/SMS delivery;
- platform system-health dashboard;
- integration adapters/webhooks;
- billing/accounting/CRM/payroll provider synchronization;
- scheduled report distribution;
- unrestricted cross-tenant regulated-content analytics; and
- changes to tenant QMS notification delivery or tenant reporting.
