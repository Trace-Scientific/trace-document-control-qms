# Support SLA Escalation and Reporting

Status: launch-readiness slice
Baseline: `main` at `ec815661c8ad3f0e4231925b104c4ee33699287e`

## Purpose

Surface overdue customer-support response and closure targets to authorized Trace personnel without exposing internal operational data to customers and without altering controlled tenant-access rules.

## Escalation scan

An authorized Trace platform user may run a governed overdue-SLA scan.

The scan evaluates assigned, active `HelpSupportRequest` records and detects:

- response SLA overdue when the request is still OPEN and `responseDueAt` has passed;
- closure SLA overdue when the request is not CLOSED and `closureDueAt` has passed.

Only requests with an assigned Trace platform identity are eligible for an escalation notification.

## Notifications

Overdue events create platform `IN_APP` notifications addressed only to the assigned Trace support identity.

Notification types:

- `SUPPORT_RESPONSE_SLA_OVERDUE`
- `SUPPORT_CLOSURE_SLA_OVERDUE`

Each alert uses a deterministic dedupe key tied to request + milestone, so repeated scans do not create duplicate overdue alerts.

Payloads include only the request identifier/reference, milestone, due timestamp, and Platform Administration support path.

They do not contain the customer support description, tenant credentials, regulated QMS data, or controlled support-access session information.

## Operational reporting

The governed platform operational snapshot now includes:

- customer Help requests by lifecycle status;
- overdue response SLA count;
- overdue closure SLA count;
- unassigned active support request count.

These metrics are control-plane operational data only.

## Security boundary

SLA escalation and notification do not create or authorize:

- `SupportAccessRequest`;
- `SupportAccessApproval`;
- `SupportSession`;
- tenant impersonation;
- tenant RBAC access;
- QMS mutation authority.

## Scheduling boundary

This slice provides the idempotent scanner and governed manual trigger, but does not add or change Railway schedules.

A later deployment slice may schedule the same scanner after runtime cadence and monitoring controls are approved.
