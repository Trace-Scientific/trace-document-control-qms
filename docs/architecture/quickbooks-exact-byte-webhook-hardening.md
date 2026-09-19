# QuickBooks Exact-Byte Webhook Hardening

Status: PR 27 integration hardening
Baseline: `main` at `9d5174fd5461c36e2a0739caf189230b1085e446`

## Purpose

Strengthen the existing QuickBooks Online webhook boundary without introducing unsafe automatic delivery reconciliation.

QuickBooks change-event webhooks already use HMAC-SHA256 verification and realm/company matching. This slice moves signature verification to the exact raw request bytes preserved by the PR 16 inbound boundary, so authenticity does not depend on UTF-8 decoding/re-encoding.

## Signature boundary

The adapter verifies `intuit-signature` with the configured webhook verifier token using HMAC-SHA256 over the exact inbound byte sequence.

JSON decoding and accounting-change normalization occur only after signature verification succeeds.

The existing configured QuickBooks realm/company ID must still match every accepted event notification.

## Normalized accounting evidence

Supported normalized entity changes remain bounded to the reviewed accounting types and operations already present in the adapter.

This PR does not expand the normalized event schema or increase QuickBooks authority.

## Reconciliation boundary

QuickBooks webhook changes remain observational only.

The current QuickBooks data-change payload identifies:

- QuickBooks realm/company;
- entity type;
- entity ID;
- operation;
- provider update timestamp when supplied.

It does not carry a Trace-owned delivery idempotency/correlation key that safely links one webhook change back to one governed outbound create delivery.

Therefore this PR deliberately does **not** add callback-driven mutation of `PlatformIntegrationDelivery`, does not resolve `RECONCILIATION_REQUIRED`, and does not trigger retry/replay.

A later QuickBooks reconciliation PR would require a separately reviewed correlation mechanism proving that the provider entity belongs to the exact governed outbound delivery.

## Security and governance

- QuickBooks does not gain tenant or platform authorization authority.
- Signature verification precedes normalization.
- Realm mismatch is rejected.
- Raw webhook bodies are not persisted.
- Provider change events do not mutate QMS records.
- Provider change events do not retry, replay, or recreate external accounting objects.
- No database migration is introduced.
- No Railway or protected AWS resources are changed.

## Validation boundary

Railway remains synthetic-data development preview only. QuickBooks preview testing must use Intuit sandbox credentials and synthetic accounting data.
