# Salesforce CDC Normalized Event Persistence Boundary

Status: PR 37 integration hardening
Baseline: `main` at `5a6a133c53e989ec39bd9599e929977b177e453b`

## Purpose

Persist validated Salesforce CDC `ChangeEventHeader` normalization as a separate immutable provider-derived record linked back to the original immutable event receipt.

This slice persists only metadata already validated by the PR 36 semantic normalizer. It does not persist record-body fields, map provider data into QMS entities, or activate live runtime processing.

## Normalized event model

`PlatformSalesforceCdcNormalizedEvent` stores:

- immutable receipt ID;
- schema ID;
- schema SHA-256;
- payload SHA-256;
- entity name;
- record IDs;
- allowlisted change type;
- change origin;
- transaction key;
- sequence number;
- commit timestamp;
- commit user;
- commit number;
- expanded changed fields;
- expanded nulled fields;
- expanded diff fields;
- deterministic normalized SHA-256;
- normalization timestamp.

The raw provider payload is not duplicated in this table.

## Evidence binding

Before insert, the persistence service locks and verifies the referenced immutable receipt.

The normalized record is accepted only when:

- the receipt exists;
- receipt schema ID = normalized schema ID;
- receipt payload SHA-256 = normalized payload SHA-256.

The normalized schema SHA-256 comes from the already-governed interpretation/normalization chain.

## Deterministic normalization evidence

The service serializes the normalized event using a fixed key order and computes SHA-256 over that canonical JSON string.

This `normalizedSha256` provides a compact integrity value for the exact normalized metadata produced from the immutable receipt evidence.

## Idempotency

There is exactly one normalized record per receipt.

The insert uses:

`ON CONFLICT ("receiptId") DO NOTHING`

On replay, the existing row must match:

- schema ID;
- schema SHA-256;
- payload SHA-256;
- normalized SHA-256.

Any mismatch fails closed as an immutable normalization conflict.

## Database immutability

Database triggers reject UPDATE and DELETE operations on normalized Salesforce CDC records.

This preserves the normalized provider-derived representation as append-only evidence.

## Database constraints

The database independently enforces:

- SHA-256 formatting;
- entity-name length;
- reviewed change-type allowlist;
- sequence number >= 1;
- commit timestamp >= 0;
- commit number >= 0;
- JSON-array shape for record IDs and field lists.

## Persistence boundary

This table contains only normalized `ChangeEventHeader` metadata.

It does not contain:

- raw payload bytes;
- arbitrary Salesforce record-body values;
- provider-to-QMS mapping results;
- QMS entity identifiers;
- workflow/signature decisions.

## Runtime boundary

`SalesforceCdcNormalizedEventPersistenceService` is not composed in `integration-runtime.ts`.

Merging this PR therefore does not start live normalization or persistence.

## Explicitly deferred

- integration of normalization/persistence into the live subscriber controller;
- record-body extraction;
- provider-to-QMS mapping;
- downstream QMS mutation;
- autonomous flow-control refill;
- reconnect/backoff;
- runtime/scheduler activation;
- Railway changes;
- protected AWS provisioning.

## Governance boundary

A normalized provider event remains evidence about external Salesforce activity only. It does not authorize or perform controlled-document changes, approvals, signatures, role changes, or any other QMS mutation.
