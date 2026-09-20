# Salesforce Pub/Sub Subscribe Streaming Transport Boundary

Status: PR 32 integration hardening
Baseline: `main` at `6205c98aab55275e01c73e52446aa75ea60b58ce`

## Purpose

Implement the live Salesforce Pub/Sub `Subscribe` HTTP/2 transport boundary without enabling runtime subscriber activation, Avro decoding, or persistence.

This slice connects the previously reviewed Subscribe protocol codecs to a real secure streaming transport while keeping the transport unreachable from application runtime composition.

## Network boundary

The transport connects only to:

`https://api.pubsub.salesforce.com`

and opens only:

`/eventbus.v1.PubSub/Subscribe`

The HTTP/2 request uses:

- POST;
- `content-type: application/grpc`;
- `te: trailers`;
- Salesforce `accesstoken`;
- Salesforce `instanceurl`;
- Salesforce `tenantid`.

Caller-provided hosts, plaintext HTTP/2, TLS-disable flags, custom CA overrides, proxy destinations, `Publish`, `PublishStream`, and `ManagedSubscribe` are not introduced.

## Streaming gRPC framing

The transport reassembles standard uncompressed gRPC message frames across arbitrary HTTP/2 data-chunk boundaries.

The decoder supports:

- a frame split across multiple chunks;
- multiple complete frames in one chunk;
- one complete frame followed by an incomplete next frame.

It rejects:

- compressed gRPC messages;
- an individual message larger than 4 MB;
- an HTTP/2 data chunk larger than 16 MB;
- an incomplete trailing frame when the stream ends.

Each completed message is passed to the existing bounded `FetchResponse` decoder before callback delivery.

## Request sequencing

The returned stream handle exposes only three operations:

- `sendInitial(...)`
- `requestMore(numRequested)`
- `close()`

The initial FetchRequest can be sent only once.

A flow-control request cannot be sent before the initial request. Follow-up requests use the PR 31 flow-control encoder and therefore cannot silently change topic or replay starting point.

## Lifecycle boundary

The stream uses a 300-second idle timeout.

Salesforce documents empty FetchResponse keepalives within 270 seconds when there are no events, so a 300-second local idle bound allows the reviewed keepalive interval while failing closed if the stream becomes silent beyond that window.

The transport closes on:

- HTTP transport failure;
- request/session error;
- malformed streaming frame;
- malformed FetchResponse envelope;
- idle timeout;
- non-zero or missing terminal gRPC status.

There is no automatic reconnect in this slice.

## Callback boundary

Completed FetchResponse envelopes are delivered through injected callbacks:

- `onResponse`
- `onError`
- `onEnd`

Callbacks receive only the already-bounded protocol envelope from PR 31. The transport does not decode Avro payloads, normalize Salesforce CRM records, write checkpoints, or persist events.

## Runtime boundary

`NodeHttp2SalesforcePubSubSubscribeTransport` is **not** registered or instantiated in `integration-runtime.ts`.

Merging this PR therefore does not start a Salesforce subscription by itself.

## Explicitly deferred

- subscriber runtime composition;
- worker process/scheduler;
- replay checkpoint persistence;
- reconnect/backoff behavior;
- OAuth refresh during an active stream;
- Avro schema-based event decoding;
- Salesforce CDC field normalization;
- normalized-event persistence;
- dead-letter processing;
- Railway service creation;
- protected AWS deployment.

## Governance boundary

The transport has no QMS mutation authority, no tenant/platform authorization authority, and no Salesforce write RPC. It only provides a constrained streaming transport for later governed composition.
