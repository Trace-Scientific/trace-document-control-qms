# PR 16 Scope Check — Provider-Safe Inbound Webhook Boundary

Baseline: `789ee4198fc926f5cbe1cfb374129d4ee4576205`

## Included

- Read inbound request bodies as exact bytes before any decoding.
- Enforce a bounded 2 MiB webhook payload limit.
- Derive fallback idempotency and persisted receipt SHA-256 from the exact bytes.
- Preserve a decoded UTF-8 text representation for existing JSON adapters.
- Pass the canonical request URL and parsed URL-encoded form parameters to adapter calls.
- Add regression tests for the provider-safe boundary.
- Record the post-PR-15 integration hardening sequence.

## Security properties

- Core framework still does not interpret provider signatures.
- Providers must verify authenticity before returning normalized events.
- Raw webhook bodies are not persisted; only the existing SHA-256 digest is stored.
- Existing tenant authorization and platform authorization domains are unchanged.
- No provider receives additional authority.

## Explicit exclusions

- Enabling SendGrid or Twilio inbound callbacks.
- AWS Secrets Manager integration.
- OAuth consent/refresh-token lifecycle.
- Provider-delivery reference persistence.
- Salesforce CDC/Pub-Sub subscriber.
- Schema migrations.

## Compatibility

Stripe, QuickBooks, and Zendesk continue receiving the decoded text body and headers they already use. The additional exact-byte/canonical-request evidence is additive and available for later provider-specific adapters that require it.
