# Support SLA Scheduler Runtime Scope Check

## Included

- Machine-authenticated internal scheduler endpoint.
- One-shot HTTPS-only runner.
- Shared CRON_SECRET authentication.
- Redirect refusal.
- Dedicated scheduled-operation key and 10-minute lease.
- Success/failure heartbeat state.
- Explicit SUPPORT_SLA_SCHEDULER_CONFIGURED health declaration.
- Missed-run and consecutive-failure health detection.
- Platform System Health display.
- Reviewed 15-minute preview cadence and activation runbook.

## Explicitly excluded

- No Railway service or cron is created by this PR.
- No scheduler enable flag is set by this PR.
- No Salesforce changes.
- No customer-facing SLA alert.
- No tenant support-access authority.
- No email/SMS escalation.

## Acceptance guardrail

The scheduler configuration flag must not be enabled until the separate cron service has completed a successful one-time run against the merged preview application.
