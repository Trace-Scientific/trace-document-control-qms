# Provider Delivery Idempotency & Reconciliation

Status: PR 19 integration hardening
Baseline: `main` at `9533b540a76d8e8cb5b17a73da6252fb9ec649c5`

## Purpose

Prevent ambiguous outbound-provider outcomes from being blindly replayed and creating duplicate external objects, messages, tickets, or communications.

## Delivery-state model

`PlatformIntegrationDelivery` gains `RECONCILIATION_REQUIRED` plus bounded provider evidence fields:

- provider request/correlation identifier;
- provider object/resource identifier;
- normalized provider outcome;
- reconciliation reason;
- reconciliation timestamp and accountable platform actor.

A delivery enters reconciliation when the provider outcome cannot be determined safely. Most importantly, an abandoned five-minute `PROCESSING` lease is no longer automatically moved back to `RETRY`; it is treated as an unknown outcome because the worker may have lost its lease after the provider accepted the request.

## Provider outcome policy

Clear configuration failures are not treated as ambiguous. Clear provider 4xx rejections are represented as confirmed failures. Rate limits may use bounded retry when the provider has clearly rejected the request before acceptance.

Network failures, HTTP 408, and server-side outcomes that do not give Trace reliable acceptance evidence are treated conservatively as ambiguous for providers without a reviewed idempotency guarantee. Those deliveries stop in `RECONCILIATION_REQUIRED`.

Stripe is handled differently because its documented POST idempotency contract permits a request to be retried with the same idempotency key after connection errors without creating a second object. The persisted Trace delivery idempotency key continues to be sent unchanged as Stripe's `Idempotency-Key`.

## Provider correlation evidence

When a provider returns confirmed acceptance, adapters persist only bounded identifiers/status evidence, not provider payloads or credentials. Current adapter evidence includes, where returned:

- Stripe request ID and created object ID;
- QuickBooks `intuit_tid` and created Customer/Invoice/Payment ID;
- Salesforce created record ID and request ID header when available;
- SendGrid accepted-message correlation header when available;
- Twilio Message SID and initial message status;
- Zendesk ticket ID and request ID header when available.

Absence of a provider request ID is allowed and is not replaced with fabricated evidence.

## Reconciliation workflow

Reconciliation requires `platform.integration.manage` and an explicit reason. The operator may record provider request/object identifiers found during investigation and choose one of three resolutions:

- `CONFIRMED_SUCCEEDED`: mark the original delivery succeeded without replay;
- `CONFIRMED_NOT_DELIVERED`: return the original delivery to the bounded retry queue;
- `ABANDON`: dead-letter the original delivery without replay.

Every resolution writes a `platform.integration.delivery.reconciled` audit event with the accountable platform identity/membership and resolution.

The platform delivery list exposes the correlation and reconciliation fields, and unresolved reconciliation items degrade integration health.

## Security and governance boundary

- No provider gains tenant or platform authorization authority.
- No provider response body is persisted as reconciliation evidence.
- Credential values remain outside application tables.
- Reconciliation does not create a new external operation; it only resolves the state of the original governed delivery.
- A dead-letter replay remains a separate explicit, audited operator action.

## Deferred work

Provider delivery-status callbacks remain separate PR 20+ work and must use the hardened inbound verification boundary from PR 16. The callback implementation may later automate portions of reconciliation only when provider identity, signature validation, event identity, and delivery-to-provider-resource correlation are all verified.
