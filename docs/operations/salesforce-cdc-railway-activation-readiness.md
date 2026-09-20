# Railway Salesforce CDC Worker Activation Readiness

Status: readiness package only
Baseline: `main` at `2e6756c7df519267902fe2c97b1ebb85131bc21b`

## Purpose

Define the exact Railway service configuration, preflight checks, activation criteria, monitoring evidence, and rollback actions required before the guarded Salesforce CDC worker may be enabled.

This document does not create a Railway service, set variables, configure a cron schedule, or enable the worker.

## Proposed Railway service

Recommended service name:

`salesforce-cdc-worker`

Repository:

`Trace-Scientific/trace-document-control-qms`

Branch:

`main`

Dockerfile:

`/Dockerfile.preview`

Start command:

`npm run salesforce:cdc:worker`

Restart policy:

`never` / no automatic restart

Replicas:

`1`

Region:

same preview region as the application service unless separately reviewed.

No public domain is required for the worker service because it calls the existing application HTTPS endpoint.

## Required environment variables

The future worker service must define:

- `APP_BASE_URL` — HTTPS base URL of the reviewed preview application;
- `CRON_SECRET` — same >=32-character secret expected by the application internal route;
- `SALESFORCE_CDC_WORKER_ENABLED=true`;
- optional `SALESFORCE_CDC_WORKER_MAX_RUN_MS` — integer 1000–300000, default 240000.

The application service that receives the internal POST must also define:

- the same `CRON_SECRET`;
- `SALESFORCE_CDC_WORKER_ENABLED=true`;
- any governed credential-store variables already required for Salesforce OAuth credentials;
- database connectivity required by the subscriber state and persistence services.

Do not place raw Salesforce access tokens directly in Railway variables when the governed credential reference points to an approved credential store.

## Scheduling recommendation

No schedule is configured by this PR.

When activation is separately approved, the initial preview cadence should be conservative and non-overlapping.

Recommended starting cadence:

`*/10 * * * *`

Because each run is bounded to at most 300 seconds, a 10-minute cadence leaves at least 5 minutes between maximum-duration runs.

Do not use a cadence shorter than the configured maximum run duration plus an operational safety margin.

## Preflight checklist

Before setting the enable flag or schedule:

1. Confirm the application deployment on `main` is healthy.
2. Confirm database migrations are fully applied.
3. Confirm the guarded internal route returns 401 without a bearer token.
4. Confirm the guarded internal route returns 503 while `SALESFORCE_CDC_WORKER_ENABLED` is absent/false.
5. Confirm the worker image contains `scripts/run-salesforce-cdc-worker.mjs`.
6. Confirm `APP_BASE_URL` is the Railway-generated HTTPS application URL or another reviewed HTTPS endpoint.
7. Confirm `CRON_SECRET` matches between worker and application services and is at least 32 characters.
8. Confirm at least one governed Salesforce integration connection and CDC subscription have been intentionally configured for synthetic/non-regulated validation data.
9. Confirm the Salesforce credential reference resolves through an approved credential-store scheme.
10. Confirm there is no existing active Salesforce CDC worker service or duplicate schedule.
11. Confirm operational staff know the rollback steps below.

## Controlled activation sequence

A later activation change should perform these actions in order:

1. Create the Railway worker service from `main`.
2. Set Dockerfile path to `/Dockerfile.preview`.
3. Set start command to `npm run salesforce:cdc:worker`.
4. Set restart policy to never.
5. Set replicas to 1.
6. Configure `APP_BASE_URL`, `CRON_SECRET`, and optional max-run value.
7. Leave `SALESFORCE_CDC_WORKER_ENABLED` unset or false.
8. Deploy and confirm the service fails closed because the enable flag is absent.
9. Set `SALESFORCE_CDC_WORKER_ENABLED=true` on both worker and application services.
10. Perform one manual run.
11. Verify expected bounded outcome and database evidence.
12. Only after successful manual evidence, add the reviewed cron schedule.

## Acceptance evidence for the first manual run

Capture:

- worker deployment ID;
- application deployment ID;
- exact `main` commit SHA;
- run start/end timestamps;
- worker outcome: NO_WORK, COMPLETED, or TIMED_OUT;
- subscription ID when applicable;
- completion outcome when applicable;
- whether any subscription became DEGRADED;
- receipt count before/after;
- normalized-event count before/after;
- replay checkpoint before/after;
- evidence that no QMS document/workflow/signature data changed.

Do not capture access tokens, credential payloads, raw regulated data, or secrets in screenshots/log exports.

## Healthy activation criteria

The preview activation is healthy only when all applicable checks pass:

- worker exits after one bounded run;
- no overlapping worker instances;
- no unexpected restart loop;
- no unbounded `requestMore` behavior;
- EVENT checkpoint advances only after durable receipt and normalized-event persistence;
- no repeated DEGRADED state caused by configuration;
- no provider credentials appear in logs;
- no QMS mutation occurs;
- application readiness remains healthy.

## Rollback / emergency stop

If any activation criterion fails:

1. Remove or set `SALESFORCE_CDC_WORKER_ENABLED=false` on the worker service.
2. Remove or disable the Railway cron schedule.
3. Stop/delete only the dedicated `salesforce-cdc-worker` service if needed.
4. Keep the primary application service running unless the application itself is unhealthy.
5. Do not manually advance Salesforce replay checkpoints.
6. Preserve immutable receipt and normalized-event evidence for investigation.
7. Record the last known worker deployment ID, run outcome, subscription status, and replay checkpoint.
8. Correct configuration/code through a reviewed PR before reactivation.

## Explicit non-activation statement

This readiness package does not:

- create `salesforce-cdc-worker` in Railway;
- change any Railway variable;
- set `SALESFORCE_CDC_WORKER_ENABLED=true`;
- add a Railway cron schedule;
- alter the primary application start command;
- create reconnect/backoff behavior;
- enable record-body mapping or QMS mutation.
