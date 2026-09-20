# Salesforce CDC Subscriber Controller Boundary

Status: PR 33 integration hardening
Baseline: `main` at `a1ed4bf772f96c66fa7b357ee704c1aff9449f1d`

## Purpose

Compose the previously reviewed Salesforce subscriber state, governed credential resolver, Pub/Sub authentication metadata parser, and Subscribe streaming transport into a controller that can safely claim one READY subscription and open one bounded Salesforce Subscribe stream.

This PR still does not enable runtime activation or durable CRM event ingestion.

## Claim boundary

The controller claims at most one READY Salesforce CDC subscription at a time.

The state claim now returns the governed integration `credentialRef` together with:

- subscription ID;
- connection ID;
- topic;
- last replay ID.

Only ACTIVE `salesforce.crm` connections with a non-null credential reference are eligible for claim.

Claim ownership remains enforced by the durable subscriber state service.

## Credential boundary

The controller resolves the provider credential only through the injected governed `PlatformCredentialResolver`.

The resulting credential bundle is parsed by the existing Salesforce Pub/Sub metadata parser, which requires:

- access token;
- approved Salesforce instance URL;
- explicit Salesforce org/tenant ID.

Credential resolution or parsing failure marks the claimed subscription DEGRADED using a bounded internal failure code. Raw provider credential content or provider error text is not persisted as a failure code.

## Replay starting point

If a durable replay ID exists, the controller starts with:

- replay preset: `CUSTOM`;
- stored replay ID.

If no durable replay ID exists, the controller starts with:

- replay preset: `LATEST`.

The initial request size is bounded to 10 events.

No autonomous follow-up `requestMore` behavior is introduced in this PR.

## Keepalive checkpointing

A verified empty FetchResponse is treated as a keepalive.

The controller persists the response's latest replay ID as a `KEEPALIVE` checkpoint under the current worker claim.

This allows the durable replay cursor to remain fresh while no event content is being processed.

## Event replay safety

This PR deliberately does **not** checkpoint a non-empty FetchResponse.

Advancing an event replay cursor before the corresponding event payload is durably persisted would create a data-loss risk because the subscriber could resume after that event without any durable record of the event itself.

Therefore, when a non-empty event response is observed while durable event persistence is still disabled, the controller:

1. closes the stream;
2. does not write an event replay checkpoint;
3. marks the subscription DEGRADED with `EVENT_PERSISTENCE_NOT_ENABLED`.

The later durable-ingestion slice must persist the event (or an immutable receipt) before the controller is permitted to advance an EVENT checkpoint.

## Stream termination

Normal stream end or an explicit controller close releases the claimed subscription back to READY.

Transport/configuration failures mark the claimed subscription DEGRADED with bounded internal codes.

Automatic reconnect/backoff is not introduced here.

## Runtime boundary

`SalesforceCdcSubscriberController` is not instantiated or exported from `integration-runtime.ts`.

Merging this PR therefore does not start Salesforce CDC subscriptions in any normal application process.

## Explicitly deferred

- durable Salesforce event receipt/persistence;
- Avro schema decoding;
- CDC CRM-field normalization;
- EVENT replay checkpoint advancement;
- autonomous flow-control refill;
- automatic reconnect/backoff;
- active-stream OAuth refresh;
- runtime/scheduler registration;
- Railway service creation;
- protected AWS deployment.

## Governance boundary

The controller has no QMS record mutation authority, no human approval/signature authority, no platform/tenant role authority, and no Salesforce write RPC.
