# PR 32 Scope Check — Salesforce Subscribe Streaming Transport

## Included

- Secure HTTP/2 connection to the fixed Salesforce Pub/Sub authority.
- Hard-coded `Subscribe` RPC path.
- Required Salesforce RPC metadata injection.
- Uncompressed gRPC stream-frame reassembly.
- Bounded 4 MB message size and 16 MB HTTP/2 chunk size.
- Existing bounded FetchResponse decoding before callback delivery.
- One-time initial request sequencing.
- Flow-control requests only after initialization.
- 300-second idle timeout.
- Terminal HTTP/gRPC/framing error handling.
- Explicit `onResponse`, `onError`, and `onEnd` callbacks.
- Tests for frame splitting, multi-frame chunks, malformed framing, metadata, sequencing, lifecycle bounds, and no runtime composition.

## Explicitly excluded

- No runtime subscriber registration.
- No automatic reconnect/backoff.
- No replay checkpoint database writes.
- No Avro decoding.
- No CRM record normalization or persistence.
- No OAuth refresh during the stream.
- No Publish/PublishStream/ManagedSubscribe.
- No scheduler or Railway service.
- No database migration.
- No protected AWS provisioning.

## Acceptance guardrail

The repository may contain a real Salesforce Subscribe transport after merge, but no normal application process may instantiate it. The transport must remain network-constrained to the reviewed Salesforce endpoint/RPC and must not persist or interpret CDC event payloads.
