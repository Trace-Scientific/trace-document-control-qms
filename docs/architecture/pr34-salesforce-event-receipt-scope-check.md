# PR 34 Scope Check — Salesforce Durable Event Receipts

## Included

- Add `PlatformSalesforceCdcEventReceipt`.
- Store bounded raw event payload bytes plus SHA-256.
- Bind every receipt to governed subscription, connection, and topic.
- Enforce idempotency on subscription + event ID + replay ID.
- Verify duplicate immutable evidence before accepting replay.
- Enforce database UPDATE/DELETE immutability triggers.
- Persist all event receipts before EVENT replay checkpoint advancement.
- Degrade without checkpoint advancement when receipt persistence fails.
- Preserve KEEPALIVE checkpoint behavior.
- Add receipt/model/controller replay-safety tests.
- Add architecture documentation.

## Explicitly excluded

- No Avro decoding.
- No CRM field normalization.
- No downstream QMS mutation.
- No autonomous flow-control refill.
- No automatic reconnect/backoff.
- No runtime/scheduler activation.
- No Railway resource mutation.
- No protected AWS provisioning.

## Acceptance guardrail

For any non-empty Salesforce FetchResponse, the durable EVENT replay checkpoint must never advance until every event in that response has a successfully inserted or identically verified immutable receipt.
