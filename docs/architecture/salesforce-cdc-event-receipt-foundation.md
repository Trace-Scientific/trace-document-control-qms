# Salesforce CDC Durable Event Receipt Foundation

Status: PR 34 integration hardening
Baseline: `main` at `f8ff8ec6c32a7a8c68ee518dd7063cf036ae4440`

## Purpose

Introduce durable, immutable Salesforce CDC event receipts and permit EVENT replay advancement only after every event in a FetchResponse has been durably recorded.

This slice closes the replay-safety gap identified in PR 33 while still deferring Avro decoding, CRM normalization, downstream QMS mutation, automatic reconnect, and runtime activation.

## Immutable receipt model

`PlatformSalesforceCdcEventReceipt` stores only the bounded provider envelope required for safe replay:

- governed subscription ID;
- governed connection ID;
- governed topic;
- Salesforce event ID;
- Salesforce schema ID;
- opaque event replay ID as canonical base64;
- raw event payload bytes;
- SHA-256 of the raw payload;
- receipt timestamp.

The payload remains opaque. No Avro fields or Salesforce CRM content are interpreted in this PR.

Receipt payloads are limited to 3 MB, matching the reviewed Subscribe protocol boundary.

## Idempotency

The idempotency key is:

`(subscriptionId, eventId, replayIdBase64)`

A replayed event uses `INSERT ... ON CONFLICT DO NOTHING`.

If a matching receipt already exists, the service verifies that connection ID, topic, schema ID, and payload SHA-256 are identical. Any mismatch fails closed as an immutable-evidence conflict.

## Database immutability

The receipt table is append-only.

Database triggers reject both UPDATE and DELETE operations on `PlatformSalesforceCdcEventReceipt`.

This protects receipt evidence from accidental application mutation after insertion.

## Governed subscription binding

Before insert, the service verifies that:

- the subscription exists;
- it is RUNNING;
- its connection ID matches the claimed connection;
- its topic matches the claimed topic.

This prevents a valid Salesforce envelope from being attached to the wrong governed subscription.

## Persist-before-checkpoint invariant

For a non-empty FetchResponse, the controller now performs these steps in order:

1. persist every event receipt;
2. verify any duplicate receipts match immutable stored evidence;
3. only after all receipt writes succeed, advance the subscription replay checkpoint to the response's `latest_replay_id` with checkpoint kind EVENT.

If any receipt write fails, the controller closes the stream, writes no EVENT checkpoint, and marks the subscription DEGRADED with `EVENT_RECEIPT_PERSIST_FAILED`.

If the process stops after some receipts are inserted but before the EVENT checkpoint, Salesforce can replay the batch. Existing identical receipts are accepted idempotently, allowing the batch to complete safely without duplicate durable evidence.

## Keepalive behavior

Empty FetchResponse keepalives continue to checkpoint their latest replay ID directly as KEEPALIVE because they contain no event payload requiring durable receipt persistence.

## Explicitly deferred

- Avro schema decoding;
- CDC field extraction/normalization;
- normalized CRM event model;
- downstream QMS mutation;
- autonomous `requestMore` flow control;
- automatic reconnect/backoff;
- active-stream OAuth refresh;
- runtime/scheduler registration;
- Railway service creation;
- protected AWS deployment.

## Governance boundary

Durable receipts are provider evidence only. They do not grant tenant authority, create QMS records, perform approvals/signatures, alter roles, or write back to Salesforce.
