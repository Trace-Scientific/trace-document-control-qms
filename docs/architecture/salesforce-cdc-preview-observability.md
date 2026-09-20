# Salesforce CDC Preview Activation Observability

Status: PR 42 activation preparation
Baseline: `main` at `43396e4c4f8f534b625e72fb76b6a44eb65f7c62`

## Purpose

Add the final application-side observability needed before the first manual Salesforce CDC worker run in Railway preview, while leaving the worker disabled and unscheduled.

## System health visibility

The permission-controlled Platform System health workspace now includes a Salesforce CDC card with only sanitized operational metadata:

- worker enable flag state;
- DISABLED / READY / RUNNING / DEGRADED subscription counts;
- stale RUNNING claim count;
- immutable event receipts created in the last 24 hours;
- immutable normalized events created in the last 24 hours;
- latest replay-checkpoint timestamp;
- latest event timestamp.

The health response does not expose:

- replay ID values;
- Salesforce topic names;
- Salesforce record IDs;
- raw payload bytes;
- credential references;
- access tokens or refresh tokens;
- provider exception payloads.

A CDC health status is DEGRADED when any subscription is DEGRADED or any RUNNING claim is stale beyond five minutes. A configured but disabled worker is not treated as unhealthy by itself.

## Read-only worker preflight

The existing internal Salesforce CDC worker route now supports an authenticated GET preflight:

`GET /api/internal/platform/salesforce-cdc-worker`

The GET requires the same constant-time cron bearer authentication as POST.

GET never invokes the worker, claims a subscription, opens a Pub/Sub stream, advances a checkpoint, or mutates CDC state.

It reports only:

- whether the worker enable flag is on;
- whether the bounded max-run configuration is valid;
- resolved max-run duration;
- subscription counts by safe operational state;
- stale RUNNING claims;
- latest event/checkpoint timestamps;
- a derived `activationReady` boolean and bounded detail string.

`activationReady` requires:

- valid worker configuration;
- at least one READY subscription;
- zero RUNNING subscriptions;
- zero DEGRADED subscriptions;
- zero stale RUNNING claims.

The worker may still remain disabled while `activationReady=true`.

## Operator preflight command

The preview image now contains:

`scripts/check-salesforce-cdc-worker-preflight.mjs`

and exposes:

`npm run salesforce:cdc:preflight`

The command requires:

- HTTPS `APP_BASE_URL`;
- no URL credentials, query string, or fragment;
- `CRON_SECRET` with at least 32 characters.

It intentionally does **not** require `SALESFORCE_CDC_WORKER_ENABLED=true`, because its purpose is to verify readiness before activation.

It performs exactly one authenticated GET and exits.

## Activation boundary

This PR does not:

- create a Railway worker service;
- set Railway variables;
- enable the worker;
- create a cron schedule;
- claim or start a Salesforce subscription;
- add reconnect/backoff;
- change replay checkpoints;
- map Salesforce record bodies;
- mutate QMS records.

## First manual run sequence after this PR

After merge and a healthy application deployment:

1. configure the dedicated Railway worker service disabled;
2. run `npm run salesforce:cdc:preflight`;
3. confirm `activationReady=true`;
4. confirm System health shows zero RUNNING, zero DEGRADED, and zero stale claims;
5. only then set the worker enable flag for one separately approved manual invocation;
6. verify receipt/normalized counts and checkpoint timestamps afterward;
7. keep scheduling disabled until manual evidence is accepted.
