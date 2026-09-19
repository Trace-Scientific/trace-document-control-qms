# PR 28 Scope Check — Salesforce CDC Subscriber Foundation

## Included

- Durable connection/topic-scoped Salesforce CDC subscription state.
- `DISABLED` default lifecycle.
- Opaque replay-ID persistence as canonical base64.
- Event and keepalive checkpoint timestamps.
- Bounded worker claim/degraded-state fields.
- Claim semantics using `FOR UPDATE SKIP LOCKED`.
- Claim ownership checks for checkpoint/release/failure operations.
- Governed `/data/` topic validation.
- Platform-audited disabled subscription configuration.
- Tests locking replay, topic, lifecycle, and no-activation guardrails.

## Explicitly excluded

- No gRPC transport.
- No live Salesforce subscription.
- No Avro decoding.
- No CDC record ingestion.
- No normalized CRM event persistence.
- No activation route.
- No scheduler or new Railway service.
- No provider credential persistence.
- No tenant/QMS authority change.
- No protected AWS provisioning.

## Acceptance guardrail

Merging this PR must not create any process capable of connecting to Salesforce Pub/Sub. It only establishes durable state and worker-ownership primitives required for the later subscriber implementation.
