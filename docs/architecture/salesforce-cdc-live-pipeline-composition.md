# Salesforce CDC Live Processing Pipeline Composition

Status: PR 38 integration hardening
Baseline: `main` at `90447036f37186b61f6c8d21e02ac712bb43e58f`

## Purpose

Compose the already-reviewed Salesforce CDC processing stages inside the subscriber controller without registering or activating that controller in normal application runtime.

For every non-empty FetchResponse, the controller now performs:

1. immutable receipt persistence;
2. governed event-schema resolution by the event's own schema ID;
3. immutable receipt-bound Avro interpretation;
4. validated ChangeEventHeader semantic normalization;
5. immutable normalized-event persistence;
6. EVENT replay checkpoint advancement only after every event in the response completes all prior stages.

## Schema evolution safety

The pipeline resolves each event's `schemaId` using the reviewed Pub/Sub `GetSchema` RPC rather than assuming the topic's current schema applies to every event.

A response-local cache avoids repeating `GetSchema` for multiple events in the same FetchResponse with the same schema ID.

The cache is deliberately scoped to one response in this PR. It introduces no cross-response cache lifetime or invalidation policy.

## Event processing invariant

The EVENT replay checkpoint is the final operation for a non-empty response.

No EVENT checkpoint is written unless every event in that response has:

- an immutable receipt;
- a governed matching Avro schema;
- a receipt/hash-verified interpretation;
- validated ChangeEventHeader normalization;
- an immutable normalized-event record.

This keeps Salesforce replay recovery aligned with the durable evidence chain.

## Failure handling

Each pipeline stage maps to a bounded internal degradation code:

- `EVENT_RECEIPT_PERSIST_FAILED`
- `EVENT_SCHEMA_RESOLUTION_FAILED`
- `EVENT_INTERPRETATION_FAILED`
- `EVENT_NORMALIZATION_FAILED`
- `NORMALIZED_EVENT_PERSIST_FAILED`

On any failure:

- the stream is closed;
- the subscription is marked DEGRADED;
- the EVENT checkpoint is not advanced;
- provider error text is not persisted as the failure code.

A later retry can replay from the previous durable cursor and rely on the existing idempotent receipt/normalization stores.

## Keepalive behavior

Empty keepalive responses continue to advance only the KEEPALIVE replay checkpoint because they contain no event payload requiring the event pipeline.

## Flow-control boundary

This PR still does not call `requestMore`.

The initial request remains bounded to 10 events and no autonomous refill policy is introduced.

## Runtime boundary

`SalesforceCdcSubscriberController` remains absent from `integration-runtime.ts`.

Therefore merging this PR does not start a Salesforce subscriber, scheduler, background process, or deployment resource.

## Explicitly deferred

- normal application runtime composition;
- scheduler/worker process registration;
- autonomous flow-control refill;
- automatic reconnect/backoff;
- active-stream OAuth refresh;
- record-body persistence or mapping;
- provider-to-QMS mapping;
- downstream QMS mutation;
- Railway resource creation;
- protected AWS deployment.

## Governance boundary

This composition creates a durable external-provider evidence pipeline only. It does not authorize document changes, approvals, signatures, workflow decisions, role changes, or any other QMS mutation.
