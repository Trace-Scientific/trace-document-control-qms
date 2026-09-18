# SendGrid Signed Event Webhook Reconciliation

Status: PR 25 integration hardening
Baseline: `main` at `845bbb38f86510e976c89a442bf31b24f80d327b`

## Purpose

Enable the next provider-family callback/status hardening slice after successful Railway activation of the Twilio monitoring scheduler.

This slice enables only SendGrid delivery-status Event Webhook processing. It does not enable inbound email parsing, engagement analytics, marketing workflows, or automatic resend.

## Outbound correlation

`sendgrid.email.send` adds one platform-owned v3 Mail Send custom argument:

- `trace_delivery_key` = the persisted Trace integration delivery idempotency key.

The value is an opaque Trace correlation identifier and must not contain PHI, PII, email content, customer record data, or regulated evidence. Callers cannot supply arbitrary `custom_args`.

## Signature verification

The adapter verifies the SendGrid Signed Event Webhook using:

- exact raw request bytes from the PR 16 hardened inbound boundary;
- `X-Twilio-Email-Event-Webhook-Timestamp`;
- `X-Twilio-Email-Event-Webhook-Signature`;
- the configured SendGrid ECDSA public verification key.

The signature is verified over the timestamp concatenated with the exact raw payload bytes using ECDSA/SHA-256. JSON parsing happens only after successful verification.

The public verification key is stored as connection configuration because it is public verification material, not an API secret. Provider API credentials remain resolved through the governed credential boundary.

## Accepted events

This slice accepts only bounded SendGrid delivery events:

- `processed`
- `delivered`
- `deferred`
- `bounce`
- `dropped`

Engagement, marketing, account-change, and inbound-parse events are rejected by this adapter slice.

Normalized evidence retains only bounded provider/correlation identifiers and status:

- Trace delivery key;
- SendGrid event ID;
- SendGrid message ID;
- reviewed delivery event type.

Recipient email addresses, provider response text, message content, and raw webhook bodies are not copied into normalized event payloads.

## Reconciliation

After signature verification, each delivery event is correlated by active integration connection plus `trace_delivery_key`.

If the Trace delivery is `RECONCILIATION_REQUIRED`, a verified SendGrid delivery event confirms that SendGrid created/processed the original provider operation. Trace may resolve the outbound request state to `SUCCEEDED` while recording the downstream state independently as `SENDGRID_<EVENT>`.

A `bounce` or `dropped` event does not authorize an automatic resend. It describes downstream handling of an already accepted provider request.

If a provider message ID has already been recorded, a callback with a different message ID is rejected rather than replacing correlation evidence.

## Audit and idempotency

- Inbound receipt idempotency remains connection-scoped.
- Raw-body SHA-256 evidence remains preserved without persisting raw bodies.
- Provider reconciliation uses `platform.integration.delivery.reconciled_by_provider_callback`.
- Later status observations use `platform.integration.delivery.provider_status_observed`.
- Provider-generated events do not fabricate a human platform actor.

## Security boundary

- SendGrid does not gain tenant RBAC or platform RBAC authority.
- Signature verification occurs before normalization or delivery mutation.
- No callback may enqueue, retry, replay, or resend an email.
- No API key or signature key material is written to normalized event evidence.
- No protected AWS resources are provisioned by this PR.
- Railway remains synthetic-data development preview only.

## Deferred work

- SendGrid engagement-event ingestion.
- SendGrid Inbound Parse.
- Provider-side polling for missed SendGrid events.
- Automated email resend based on bounce/drop/deferred status.
- Salesforce CDC/Pub/Sub expansion.
- QuickBooks/Zendesk callback expansion.
