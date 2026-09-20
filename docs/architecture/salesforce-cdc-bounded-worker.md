# Salesforce CDC Bounded Flow Control and One-Shot Worker

Status: PR 39 integration hardening
Baseline: `main` at `3508a5967b9fb6aad97a5c1f0ac0d5d1801505b5`

## Purpose

Add bounded flow-control refill and a one-shot worker runner around the existing Salesforce CDC subscriber controller without registering or deploying the worker.

## Flow-control window

The controller keeps a target pending-request window of 10 events.

After a KEEPALIVE or EVENT replay checkpoint is durably written, the controller computes:

`refill = 10 - pending_num_requested`

It sends `requestMore(refill)` only when `refill > 0`.

The controller rejects pending counts outside 0–10 and degrades with `FLOW_CONTROL_FAILED`.

For EVENT responses, refill occurs only after:

1. immutable receipt persistence;
2. exact schema resolution;
3. Avro interpretation;
4. semantic normalization;
5. immutable normalized-event persistence;
6. EVENT replay checkpoint persistence.

This prevents the worker from increasing provider delivery capacity before the prior batch is durably represented.

## Completion signal

An active subscription now exposes a completion promise with one of:

- ENDED
- CLOSED
- DEGRADED with bounded failure code

This lets an external runner await a finite controller lifecycle without polling.

## One-shot worker

`SalesforceCdcOneShotWorkerRunner` starts at most one READY subscription.

Outcomes:

- `NO_WORK` when no subscription is claimable;
- `COMPLETED` when the controller ends, closes, or degrades before the deadline;
- `TIMED_OUT` when the bounded worker duration expires.

On timeout, the runner explicitly closes the active controller, causing claim release back to READY.

## Runtime bounds

Reviewed worker limits:

- default maximum run: 240 seconds;
- minimum configurable run: 1 second;
- maximum configurable run: 300 seconds.

The runner contains no loop and no self-restart behavior.

## Activation boundary

This PR does not:

- register the controller or worker in `integration-runtime.ts`;
- add an npm start script;
- add a Railway service;
- add a cron schedule;
- add automatic reconnect/backoff.

Merging this PR therefore does not start Salesforce CDC processing in any deployed environment.

## Explicitly deferred

- deployment/service activation;
- scheduler registration;
- automatic reconnect/backoff;
- active-stream OAuth refresh;
- record-body mapping;
- provider-to-QMS mapping;
- downstream QMS mutation;
- protected AWS deployment.
