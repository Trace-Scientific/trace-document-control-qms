# PR 25 Scope Check — SendGrid Signed Event Webhook Reconciliation

## Included

- SendGrid Signed Event Webhook ECDSA verification against exact raw request bytes.
- Timestamp and signature header validation.
- Configured public verification key handling.
- Platform-owned `trace_delivery_key` outbound custom argument.
- Delivery-event allowlist and bounded normalized status evidence.
- Connection + delivery-key correlation under row lock.
- Callback-driven resolution of `RECONCILIATION_REQUIRED` provider ambiguity.
- Provider-status observation for already-resolved deliveries.
- Append-only platform audit evidence.
- Cryptographic verification and regression/security tests.

## Explicitly excluded

- No inbound email/Inbound Parse.
- No engagement or marketing event processing.
- No automatic retry, replay, or resend.
- No tenant or platform authorization change.
- No database migration.
- No provider credential persistence change.
- No Railway resource mutation.
- No protected AWS provisioning.

## Acceptance guardrail

A SendGrid event must not mutate governed delivery evidence unless the ECDSA signature validates against the exact raw request bytes and the event carries the platform-owned delivery correlation key.
