# PR 35 Scope Check — Salesforce CDC Avro Interpretation

## Included

- Bounded self-contained Avro binary decoding.
- Support core record/union/collection/named Avro types.
- Require receipt schema ID to equal governed discovered schema ID.
- Re-hash immutable receipt payload before decode.
- Re-hash governed schema JSON before accepting interpretation.
- Return a separate JSON-safe interpretation object.
- Preserve bytes/fixed values as base64.
- Reject trailing bytes, malformed values, unsafe longs, unresolved types, and resource-limit violations.
- Tests for representative Salesforce-style schemas, named references, unions, collections, hashes, schema mismatch, and no runtime composition.
- Architecture documentation.

## Explicitly excluded

- No mutation of immutable receipts.
- No interpreted-event database table.
- No Salesforce semantic normalization.
- No ChangeEventHeader business rules.
- No downstream QMS mutation.
- No runtime/scheduler activation.
- No Railway resource changes.
- No new third-party runtime dependency.
- No protected AWS provisioning.

## Acceptance guardrail

An interpreted Salesforce event may be produced only when the immutable receipt payload hash, receipt schema ID, discovered schema ID, and discovered schema hash all agree; the original receipt must remain untouched.
