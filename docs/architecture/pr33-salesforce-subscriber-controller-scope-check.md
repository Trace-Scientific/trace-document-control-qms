# PR 33 Scope Check — Salesforce CDC Subscriber Controller

## Included

- Return governed credential reference with subscriber claims.
- Require an ACTIVE Salesforce connection with a credential reference before claim.
- Resolve Salesforce credentials through the governed credential resolver.
- Parse reviewed Pub/Sub RPC metadata.
- Open the reviewed Subscribe transport.
- Start from CUSTOM replay when a stored replay ID exists.
- Start from LATEST when no replay ID exists.
- Bound the initial request to 10 events.
- Persist keepalive replay checkpoints under worker claim ownership.
- Stop and degrade on non-empty event responses while durable persistence is disabled.
- Release healthy streams to READY on normal end or explicit close.
- Mark failures DEGRADED using bounded internal codes.
- Add controller/state/runtime-boundary tests.
- Add architecture documentation.

## Explicitly excluded

- No EVENT checkpoint advancement.
- No Avro decoding.
- No CRM normalization.
- No event/receipt persistence.
- No automatic flow-control refill.
- No automatic reconnect/backoff.
- No runtime or scheduler registration.
- No Railway resource changes.
- No database migration.
- No protected AWS provisioning.

## Acceptance guardrail

A Salesforce event replay cursor must never advance beyond a non-empty FetchResponse until that event has first been durably persisted by a separately reviewed ingestion layer.
