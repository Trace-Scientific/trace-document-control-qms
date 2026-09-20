# Salesforce CDC Avro Interpretation Boundary

Status: PR 35 integration hardening
Baseline: `main` at `e14796f5b0d662fcb769c0191070ba9a276cc4ed`

## Purpose

Add bounded Avro decoding and immutable-receipt interpretation for Salesforce CDC events without modifying original receipts, persisting interpreted CRM content, or enabling downstream QMS mutation.

## Evidence chain

Interpretation requires both:

- immutable Salesforce CDC receipt evidence from PR 34; and
- a typed Salesforce schema result produced by the governed Pub/Sub schema-discovery boundary.

Before decoding, the receipt interpretation service recomputes the SHA-256 of the immutable payload bytes and requires it to match the stored receipt hash.

After decoding, it recomputes the SHA-256 of the schema JSON and requires it to match the governed schema-discovery hash.

The receipt schema ID must exactly match the discovered schema ID.

## Bounded Avro decoder

This PR adds a self-contained Avro binary decoder rather than a new third-party runtime dependency.

Supported core types:

- null;
- boolean;
- int / long;
- float / double;
- bytes;
- string;
- record;
- enum;
- array;
- map;
- union;
- fixed;
- named-type references.

Logical types are decoded only through their underlying Avro representation; this PR does not attach Salesforce-specific semantic meaning to them.

## Resource limits

The interpreter fails closed when limits are exceeded:

- schema JSON: 2 MB;
- event payload: 3 MB;
- nesting depth: 32;
- collection items: 10,000;
- string value: 1 MB;
- record fields: 2,000.

Avro long values must fit JavaScript's safe-integer range.

Raw bytes and fixed values are represented in the interpreted JSON-safe result as canonical base64 strings.

## Strict decoding behavior

The decoder rejects:

- schema-ID mismatch;
- immutable payload hash mismatch;
- discovered schema hash mismatch;
- malformed schema JSON;
- non-record root schema;
- duplicate named types;
- unresolved named types;
- invalid union branches;
- malformed booleans;
- unsafe long values;
- truncated values;
- oversized collections/strings/bytes;
- trailing payload bytes.

A successful interpretation returns a separate object containing:

- receipt ID;
- schema ID;
- schema SHA-256;
- payload SHA-256;
- decoded JSON-safe value.

## Immutability boundary

The existing immutable receipt remains unchanged.

This PR does not UPDATE the receipt table, add interpreted fields to it, or replace raw provider evidence with decoded data.

## Runtime boundary

Neither `SalesforceCdcAvroInterpreter` nor `SalesforceCdcReceiptInterpretationService` is registered in `integration-runtime.ts`.

Merging this PR therefore does not automatically decode live CDC events.

## Explicitly deferred

- persistence of interpreted/normalized events;
- Salesforce CDC semantic field normalization;
- ChangeEventHeader-specific interpretation;
- downstream QMS mutation;
- autonomous flow-control refill;
- reconnect/backoff;
- runtime/scheduler activation;
- Railway changes;
- protected AWS provisioning.

## Governance boundary

Decoded Salesforce values are interpreted provider data only. They do not gain authorization, signature, approval, or QMS-record mutation authority.
