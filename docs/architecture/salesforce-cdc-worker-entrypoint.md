# Salesforce CDC Deployment-Ready Worker Composition

Status: PR 40 integration hardening
Baseline: `main` at `d969539ceae3e4be688fd39676e07bb0ba750562`

## Purpose

Provide an explicit, reviewable execution contract for the bounded one-shot Salesforce CDC worker introduced in PR 39 without creating or scheduling any deployment resource.

This PR makes the worker invocable through the same controlled machine-to-machine pattern used by other platform operations while keeping it disabled by default.

## Composition boundary

`salesforce-cdc-worker-runtime.ts` composes:

- the governed platform credential resolver;
- `SalesforceCdcSubscriberController`;
- `SalesforceCdcOneShotWorkerRunner`.

It generates a unique bounded worker claim identifier for each invocation.

The composition module does not register itself in `integration-runtime.ts` and contains no loop, timer, scheduler, or reconnect policy.

## Explicit enable gate

The worker is disabled unless:

`SALESFORCE_CDC_WORKER_ENABLED=true`

The comparison is exact and case-sensitive.

Missing, false, or differently cased values keep the worker disabled.

This gate is checked server-side before worker execution. The standalone caller script also requires the same flag before making a request.

## Runtime duration contract

Optional:

`SALESFORCE_CDC_WORKER_MAX_RUN_MS`

Allowed range:

- minimum: 1,000 ms;
- maximum: 300,000 ms;
- default when omitted: 240,000 ms.

Non-integer or out-of-range values fail closed.

## Internal invocation route

The internal route is:

`POST /api/internal/platform/salesforce-cdc-worker`

It requires:

1. valid `Authorization: Bearer <CRON_SECRET>`;
2. `CRON_SECRET` of at least 32 characters through the existing constant-time cron-auth boundary;
3. `SALESFORCE_CDC_WORKER_ENABLED=true`.

The route returns bounded worker outcome data only.

Provider exception text, credentials, and raw event data are not returned.

## Standalone command

The repository exposes:

`npm run salesforce:cdc:worker`

which executes:

`node scripts/run-salesforce-cdc-worker.mjs`

The caller requires:

- `SALESFORCE_CDC_WORKER_ENABLED=true`;
- `APP_BASE_URL`;
- HTTPS `APP_BASE_URL`;
- no URL credentials, query parameters, or fragment;
- `CRON_SECRET` with at least 32 characters.

It performs one authenticated POST and exits.

It contains no polling, retry loop, reconnect loop, or scheduler.

## Image contract

`Dockerfile.preview` copies the standalone worker command into the runtime image.

This makes the command available for a future separately reviewed Railway worker/service configuration without creating or enabling such a service in this PR.

## Activation boundary

Merging this PR does **not** activate Salesforce CDC processing because:

- no Railway service is created;
- no cron schedule is created;
- no start command is changed;
- no default application startup imports or invokes the worker runtime;
- the server route is disabled unless the explicit enable flag is present;
- the caller script is never automatically executed.

## Future controlled activation prerequisites

A later activation change must separately review and configure:

- which environment/service invokes the command;
- `APP_BASE_URL`;
- `CRON_SECRET`;
- `SALESFORCE_CDC_WORKER_ENABLED=true`;
- optional `SALESFORCE_CDC_WORKER_MAX_RUN_MS`;
- service/schedule cadence;
- concurrency expectations;
- operational monitoring;
- rollback/deactivation instructions.

## Explicitly deferred

- Railway service creation;
- Railway cron/schedule configuration;
- automatic reconnect/backoff;
- long-running daemon mode;
- record-body mapping;
- provider-to-QMS mapping;
- downstream QMS mutation;
- protected AWS deployment.
