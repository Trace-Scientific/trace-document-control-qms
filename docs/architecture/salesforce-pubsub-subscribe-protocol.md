# Salesforce Pub/Sub Subscribe Protocol Foundation

Status: PR 31 integration hardening
Baseline: `main` at `dc50706e0fa6cbfe8ce2edfffc091c55ddc88032`

## Purpose

Add the protobuf request/response protocol foundation required for a later Salesforce Pub/Sub `Subscribe` stream without opening a network stream or ingesting CDC records in this PR.

## FetchRequest encoding

The protocol helper encodes the reviewed Salesforce `FetchRequest` fields:

- `topic_name` field 1;
- `replay_preset` field 2;
- `replay_id` field 3;
- `num_requested` field 4.

Initial requests require a governed Salesforce `/data/` topic and one replay mode:

- `LATEST`
- `EARLIEST`
- `CUSTOM`

A CUSTOM request requires a previously validated opaque replay ID. Replay IDs are never parsed as integers or assumed to be sequential.

Follow-up flow-control requests encode only `num_requested`. This prevents the helper from accidentally changing the topic or replay starting point mid-stream.

Salesforce currently limits requested events to 100 per Subscribe call/request flow, so this foundation rejects `num_requested` values outside 1–100.

## FetchResponse decoding

The decoder handles the reviewed Salesforce `FetchResponse` fields:

- repeated `ConsumerEvent` field 1;
- `latest_replay_id` field 2;
- `rpc_id` field 3;
- `pending_num_requested` field 4.

The decoder caps event count at 100 and bounds individual opaque event payloads to 3 MB.

## ConsumerEvent boundary

The helper decodes only the envelope required for later ingestion:

- producer event ID;
- schema ID;
- raw payload bytes;
- event replay ID.

The payload bytes remain opaque. This PR does not decode Avro, inspect CRM fields, normalize Salesforce data, or persist event content.

## Keepalive handling

Salesforce can send an empty `FetchResponse` with a new latest replay ID when no events are available while the stream remains healthy.

The protocol helper marks an empty response as `keepalive: true` and exposes its latest replay ID as a `KEEPALIVE` checkpoint candidate. A non-empty response exposes an `EVENT` checkpoint candidate.

This matches the existing durable subscriber-state model, which distinguishes event and keepalive checkpoint timestamps.

## Flow-control boundary

The decoder exposes `pending_num_requested` but does not automatically issue another FetchRequest.

A later stream-controller PR must decide when capacity is available and explicitly request additional events. This PR does not create autonomous flow-control behavior.

## Explicitly deferred

- secure HTTP/2 `Subscribe` stream creation;
- stream authentication metadata injection;
- streaming gRPC frame reassembly;
- reconnect/retry behavior;
- durable replay checkpoint writes;
- Avro schema-based payload decoding;
- CDC record normalization;
- normalized-event persistence;
- dead-letter handling;
- runtime registration;
- scheduler/process deployment;
- Railway or protected AWS changes.

## Governance boundary

This module has no network access and no database access. It cannot open a Salesforce connection, mutate QMS data, create platform actors, or persist provider content.
