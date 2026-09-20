# Salesforce CDC Semantic Normalization Boundary

Status: PR 36 integration hardening
Baseline: `main` at `d3092fe4a11d2f277c3b8a8fa9d04df137599cab`

## Purpose

Translate a verified Salesforce CDC Avro interpretation into a separate normalized provider-event header model without persisting normalized CRM content or granting any downstream QMS mutation authority.

This slice is limited to `ChangeEventHeader` metadata and Pub/Sub bitmap expansion.

## Governed inputs

Normalization requires:

- the immutable-receipt-bound interpretation produced by PR 35; and
- the governed Salesforce schema object returned by the Pub/Sub schema-discovery boundary.

The normalizer independently requires:

- interpretation schema ID = governed schema ID;
- SHA-256 of schema JSON = governed schema SHA-256;
- interpretation schema SHA-256 = governed schema SHA-256.

## Allowlisted header metadata

The normalized result includes only:

- `entityName`;
- `recordIds`;
- `changeType`;
- `changeOrigin`;
- `transactionKey`;
- `sequenceNumber`;
- `commitTimestamp`;
- `commitUser`;
- `commitNumber`;
- expanded `changedFields`;
- expanded `nulledFields`;
- expanded `diffFields`.

Record body fields are deliberately excluded from the normalized model in this PR.

## Change types

The reviewed allowlist is:

- CREATE
- UPDATE
- DELETE
- UNDELETE
- SNAPSHOT
- GAP_CREATE
- GAP_UPDATE
- GAP_DELETE
- GAP_UNDELETE
- GAP_OVERFLOW

Unknown values fail closed.

## Record IDs

Normal Salesforce record IDs must be 15 or 18 alphanumeric characters.

The normalizer also accepts Salesforce's documented three-character object prefix plus wildcard form (for example `001*`) used by certain bulk field-conversion change events.

## Pub/Sub bitmap expansion

Salesforce Pub/Sub delivers `changedFields`, `nulledFields`, and `diffFields` as bitmap arrays rather than directly expanded field-name arrays.

The normalizer expands those values using the governed event Avro schema.

Top-level entries have the form:

`0x...`

Each set bit identifies the field at the corresponding event-schema position.

Compound-field entries have the form:

`parentPosition-0x...`

The parent position identifies a root Avro field. Its nested bitmap is expanded against the underlying compound record schema.

If every nested field of a compound record is selected, the normalized output uses the parent compound field name. Otherwise nested values use `Parent.Child`.

Malformed bitmaps, references outside the schema, unsupported compound shapes, and over-limit expansions fail closed.

## Bounds

- record IDs: maximum 1,000;
- expanded field names: maximum 5,000;
- field-name length: maximum 512 characters;
- ordinary header text: bounded by field-specific limits.

Sequence number must be a safe integer >= 1.

Commit timestamp and commit number must be safe integers >= 0.

## Persistence boundary

This PR does not create a normalized-event table and does not write any normalized metadata to the database.

The immutable receipt and interpreted payload remain the evidence sources.

## Runtime boundary

`SalesforceCdcSemanticNormalizer` is not registered in `integration-runtime.ts`.

Merging this PR does not activate live normalization or subscriber processing.

## Explicitly deferred

- normalized-event persistence;
- record-body field extraction;
- provider-to-QMS mapping;
- QMS record creation/update;
- autonomous flow-control refill;
- reconnect/backoff;
- runtime/scheduler activation;
- Railway changes;
- protected AWS provisioning.

## Governance boundary

Normalized Salesforce metadata remains external provider data. It cannot approve documents, create signatures, grant roles, alter subscription entitlements, or mutate controlled QMS records.
