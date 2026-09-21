# Support SLA Scheduler Runtime

Status: launch-readiness deployment slice
Baseline: `main` at `cc85e78f64b2a3e62539d8b62e05c77b91a928b4`

## Purpose

Run the idempotent support-SLA overdue scanner on a recurring schedule using the same one-shot, machine-authenticated scheduler pattern already used elsewhere in the preview environment.

## Runtime contract

The scheduler invokes:

`POST /api/internal/platform/support-sla-scan`

Authentication uses the existing constant-time `CRON_SECRET` bearer check.

The one-shot runner is:

`npm run support:sla:scan`

The runner requires:

- HTTPS `APP_BASE_URL`;
- `CRON_SECRET` of at least 32 characters;
- redirect refusal;
- a successful 2xx application response.

Any configuration or application failure exits non-zero.

## Concurrency and heartbeat

Operation key:

`support.sla.overdue.scan`

A 10-minute database lease prevents overlapping executions.

`PlatformScheduledOperationState` records:

- last start;
- last successful run;
- last failed run;
- bounded last error;
- consecutive failure count;
- last result payload.

## Health declaration

`SUPPORT_SLA_SCHEDULER_CONFIGURED=true` is the explicit deployment declaration that a recurring scheduler actually owns invocation.

When configured, Platform System Health reports the scheduler as degraded if:

- it has never succeeded;
- the last success is older than 30 minutes; or
- one or more consecutive failures are recorded.

The flag must remain absent until a dedicated scheduler service has completed one successful one-time execution.

## Reviewed preview cadence

The reviewed preview cadence is every 15 minutes:

`*/15 * * * *`

The deployment model is a separate Railway cron service from the same `main` repository, with Restart Policy `Never`.

## Security boundary

The scheduler may run only the support-SLA scan core.

It does not create or authorize:

- tenant support access;
- SupportAccessRequest;
- SupportSession;
- tenant impersonation;
- tenant RBAC;
- QMS mutations unrelated to the support-SLA escalation records/notifications already governed by the scanner.

## Activation sequence

1. Merge this code.
2. Allow the preview web service to deploy the exact merged SHA and migrations.
3. Create a separate Railway cron service from `main`.
4. Start command: `npm run support:sla:scan`.
5. Set `APP_BASE_URL` to the HTTPS preview web URL.
6. Set the same `CRON_SECRET` as the preview application.
7. Keep cron schedule absent initially.
8. Run one manual execution and verify exit success plus scheduler heartbeat.
9. Add `*/15 * * * *`.
10. Only then set `SUPPORT_SLA_SCHEDULER_CONFIGURED=true` on the web service.
11. Verify Platform System Health reports the support SLA scheduler HEALTHY.

## Rollback

Remove the cron schedule first, then remove `SUPPORT_SLA_SCHEDULER_CONFIGURED`. The scanner remains available for governed manual use.
