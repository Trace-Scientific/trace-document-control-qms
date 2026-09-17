# Twilio Monitoring Scheduler and Alert Routing

Status: PR 23 integration hardening
Baseline: `main` at `73546b65a4bfb9908bd37c8a1cd401390b6af009`

## Purpose

Add governed machine invocation, overlap protection, heartbeat evidence, health degradation, and operator alert routing around the bounded Twilio delivery-status poller from PR 22.

This PR does not provision a production scheduler. It defines the application-side contract that a reviewed scheduler may invoke later.

## Invocation and ownership

The machine endpoint is `POST /api/internal/platform/twilio-delivery-monitoring` and requires the existing constant-time `CRON_SECRET` bearer check. Human platform authorization is not substituted for machine authentication.

The reviewed cadence is every 15 minutes. The operation uses a 10-minute database lease so overlapping scheduler invocations do not execute the poller concurrently. A caller that arrives while a lease is active receives a skipped result rather than starting a second run.

## Operational state

`PlatformScheduledOperationState` stores only scheduler lease/heartbeat metadata:

- operation key;
- current lease owner and expiration;
- last started/succeeded/failed timestamps;
- bounded last error;
- consecutive failure count;
- bounded structured last-result summary.

It grants no role, permission, tenant, QMS, subscription, or provider authority.

## Alert routing

Scheduler failures and degraded Twilio polling evidence create deduplicated in-app platform alerts only for active identities/memberships that hold both:

- `platform.integration.manage`;
- `platform.notification.read`.

System-created alerts are marked `SENT` for the existing in-app inbox and receive append-only `PlatformNotificationEvent` evidence with no fabricated human actor.

Degraded polling alerts are deduplicated hourly per recipient. Scheduler execution-failure alerts are deduplicated daily per recipient.

## Health semantics

`PLATFORM_SCHEDULER_CONFIGURED=true` means deployment has declared a scheduler for this contract. When configured, platform health becomes degraded if:

- no successful run has been recorded within 30 minutes; or
- the scheduler state reports one or more consecutive failures.

When the environment variable is not enabled, health remains `NOT_CONFIGURED`; this PR does not claim that scheduler infrastructure exists.

## Duplicate-send boundary

The scheduler delegates only to the PR 22 GET-only Twilio status poller. It has no code path to enqueue an outbound integration delivery, requeue a dead letter, or POST a Twilio Message. Provider delivery failures remain evidence/alert conditions and never authorize an automatic resend.

## Deployment boundary

A later deployment slice may configure the actual recurring scheduler only after environment ownership, URL, secret injection, failure notification ownership, and validation evidence are approved. AWS protected-environment provisioning remains paused by this PR.
