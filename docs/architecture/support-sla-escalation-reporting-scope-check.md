# Support SLA Escalation Scope Check

## Included

- Detection of overdue response and closure SLA targets.
- Assigned-owner-only platform in-app notifications.
- Deterministic deduplication of repeated scans.
- PlatformNotificationEvent creation for new alerts.
- Governed manual scan endpoint and Trace-side UI control.
- Operational report metrics for overdue and unassigned support work.
- Focused authorization, isolation, and support-access separation tests.

## Explicitly excluded

- No customer-facing overdue notification.
- No email or SMS escalation.
- No automatic tenant access.
- No SupportAccessRequest or SupportSession creation.
- No customer support description in platform alert payloads.
- No Railway schedule in this slice.
- No Salesforce changes.

## Acceptance guardrail

SLA escalation is an internal Trace operations signal only. It must never grant tenant access or expose tenant-regulated content through platform notifications or reporting.
