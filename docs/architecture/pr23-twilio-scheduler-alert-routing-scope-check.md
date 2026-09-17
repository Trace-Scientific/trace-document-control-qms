# PR 23 — Scheduler Execution & Alert-Routing Hardening

Baseline: `main` at `73546b65a4bfb9908bd37c8a1cd401390b6af009`

## Included

- Adds a CRON_SECRET-authenticated internal machine endpoint for the bounded Twilio status poller.
- Defines a reviewed 15-minute cadence contract without provisioning external scheduler infrastructure.
- Adds a 10-minute database lease to prevent overlapping scheduled executions.
- Persists scheduler heartbeat/failure metadata in a dedicated operational-state table.
- Degrades platform scheduled-task health when configured execution is overdue or consecutively failing.
- Routes deduplicated in-app alerts to active operators who can both manage integrations and read platform notifications.
- Writes append-only notification-event evidence for system-generated alerts without fabricating a human actor.
- Preserves PR 22's GET-only provider observation and no-resend boundary.
- Adds regression/security tests and architecture documentation.

## Security invariants

- Machine invocation requires the existing constant-time CRON_SECRET bearer check.
- Scheduler state grants no platform or tenant authority.
- The scheduler cannot enqueue an outbound integration delivery.
- The scheduler cannot requeue a dead letter.
- The scheduler cannot POST a Twilio Message.
- Provider status failures never authorize an automatic resend.
- Alert recipients must have active platform identity and membership plus `platform.integration.manage` and `platform.notification.read`.
- System alerts do not fabricate actor identity or membership evidence.
- No tenant RBAC, QMS accountable-user, subscription, OAuth, support-access, or provider callback authority is expanded.

## Deployment boundary

- No AWS/EventBridge/Railway cron resource is provisioned in this PR.
- `PLATFORM_SCHEDULER_CONFIGURED` remains the explicit declaration that a deployment actually owns recurring invocation.
- Protected AWS validation/production provisioning remains paused.

## Next controlled slice

After this PR, review whether to deploy the scheduler in the active preview/validation environment or continue provider-family hardening. Any deployment must preserve secret isolation, HTTPS-only invocation, concurrency controls, and operational ownership evidence.
