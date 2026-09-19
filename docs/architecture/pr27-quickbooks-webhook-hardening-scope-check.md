# PR 27 Scope Check — QuickBooks Exact-Byte Webhook Hardening

## Included

- Verify `intuit-signature` over exact raw request bytes.
- Retain timing-safe HMAC-SHA256 comparison.
- Retain configured QuickBooks realm/company matching.
- Add regression tests proving byte-level signature sensitivity.
- Add guardrail tests proving QuickBooks webhook events do not auto-reconcile governed outbound deliveries.
- Document the explicit no-auto-reconciliation boundary.

## Explicitly excluded

- No QuickBooks callback-driven delivery-state mutation.
- No automatic retry, replay, or duplicate provider object creation.
- No new QuickBooks entity types or outbound operations.
- No OAuth/token lifecycle changes.
- No tenant or platform authorization changes.
- No database migration.
- No Railway resource mutation.
- No protected AWS provisioning.

## Acceptance guardrail

A QuickBooks webhook must fail if the exact signed byte sequence does not match the received raw bytes, and a verified QuickBooks data-change event must remain observational until a separately reviewed Trace-to-provider delivery correlation mechanism exists.
