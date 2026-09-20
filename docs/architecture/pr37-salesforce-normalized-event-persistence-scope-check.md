# PR 37 Scope Check — Salesforce CDC Normalized Event Persistence

## Included

- Add immutable `PlatformSalesforceCdcNormalizedEvent`.
- Link exactly one normalized record to each immutable Salesforce receipt.
- Persist only allowlisted normalized ChangeEventHeader metadata.
- Preserve schema and payload evidence hashes.
- Compute deterministic normalized SHA-256.
- Enforce idempotent insert by receipt ID.
- Verify immutable evidence on duplicate/replay.
- Reject UPDATE and DELETE at the database boundary.
- Add database checks for hashes, change types, integer bounds, and JSON-array shapes.
- Add persistence/evidence/runtime-boundary tests.
- Add architecture documentation.

## Explicitly excluded

- No record-body persistence.
- No provider-to-QMS mapping.
- No downstream QMS mutation.
- No subscriber-controller composition.
- No autonomous flow-control refill.
- No reconnect/backoff.
- No runtime/scheduler activation.
- No Railway resource changes.
- No protected AWS provisioning.

## Acceptance guardrail

A normalized Salesforce record may be persisted only when it is linked to an existing immutable receipt whose schema ID and payload SHA-256 match the normalized evidence. The resulting normalized record must remain immutable and must contain no record-body or QMS mutation data.
