# Salesforce Pub/Sub Unary gRPC Discovery Transport

Status: PR 30 integration hardening
Baseline: `main` at `91d63374b141acd5e16110ccc9c96a436e56714a`

## Purpose

Implement the first real Salesforce Pub/Sub network transport while keeping the integration incapable of subscribing to or ingesting CDC events.

This slice implements only the unary Pub/Sub discovery RPCs already defined behind the PR 29 transport interface:

- `GetTopic`
- `GetSchema`

## Protocol source

The implementation is constrained to Salesforce Pub/Sub API Version 1 service paths:

- `/eventbus.v1.PubSub/GetTopic`
- `/eventbus.v1.PubSub/GetSchema`

The request/response field numbers match the reviewed Salesforce `pubsub_api.proto` definitions for `TopicRequest`, `TopicInfo`, `SchemaRequest`, and `SchemaInfo`.

No `Subscribe`, `ManagedSubscribe`, `Publish`, or `PublishStream` RPC path is present in the transport.

## Transport

The transport uses Node's built-in secure HTTP/2 client against the fixed reviewed authority:

`https://api.pubsub.salesforce.com`

The HTTP/2 request uses POST, `content-type: application/grpc`, `te: trailers`, a 10-second gRPC timeout, and Salesforce `accesstoken`, `instanceurl`, and `tenantid` metadata.

No plaintext HTTP/2 mode, custom CA override, TLS-disable option, proxy URL, or arbitrary network target is introduced.

## Narrow protobuf codec

To avoid adding a broad gRPC/protobuf dependency before subscription review, this PR includes a narrow protobuf codec for only the scalar fields required by `GetTopic` and `GetSchema`.

The decoder rejects malformed/truncated fields, compressed gRPC messages, multi-frame unary responses, and responses larger than 2.5 MB.

## Error handling

The transport fails closed on non-200 HTTP status, connection/request error, timeout, response-size overflow, missing/non-zero `grpc-status`, malformed framing, compressed framing, or malformed required protobuf fields.

Provider error messages are bounded before being surfaced.

## Runtime boundary

The transport class is **not** composed in `integration-runtime.ts`.

Therefore merging this PR does not initiate Salesforce traffic. A future reviewed composition/activation slice must explicitly instantiate this transport.

## Explicitly deferred

- `Subscribe` or `ManagedSubscribe`;
- streaming request/response handling;
- replay activation;
- FetchRequest flow control;
- keepalive processing;
- Avro binary payload decoding;
- CDC normalized-event persistence;
- subscriber process/scheduler;
- Railway service creation;
- protected AWS deployment.

## Governance boundary

This transport performs discovery reads only. It has no Salesforce write RPC, no QMS mutation capability, no platform/tenant authorization authority, and no event-ingestion path.
