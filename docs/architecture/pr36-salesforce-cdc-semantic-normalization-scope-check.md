# PR 36 Scope Check — Salesforce CDC Semantic Normalization

## Included

- Add a separate normalized Salesforce CDC header model.
- Require governed schema ID/hash agreement.
- Normalize allowlisted ChangeEventHeader metadata only.
- Expand Pub/Sub changedFields, nulledFields, and diffFields bitmaps using the governed Avro schema.
- Support compound-field bitmap expansion.
- Allow documented CREATE/UPDATE/DELETE/UNDELETE/SNAPSHOT and GAP_* change types.
- Validate normal 15/18-character record IDs and documented object-prefix wildcard record IDs.
- Enforce field-count/text/integer bounds.
- Add tests for bitmap expansion, compound fields, gap types, schema evidence, invalid identifiers, and no runtime composition.
- Add architecture documentation.

## Explicitly excluded

- No normalized-event database persistence.
- No record-body extraction or provider-to-QMS mapping.
- No downstream QMS mutation.
- No autonomous flow-control refill.
- No reconnect/backoff.
- No runtime/scheduler activation.
- No Railway resource changes.
- No protected AWS provisioning.

## Acceptance guardrail

The normalizer may emit only validated allowlisted ChangeEventHeader metadata derived from an immutable-receipt-bound interpretation and the exact governed Avro schema. It must not persist, mutate QMS state, or treat raw Pub/Sub bitmap strings as field names.
