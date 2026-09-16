# Email and SMS Provider Adapters

## Purpose

PR 14 adds bounded outbound provider adapters for platform communications on top of the vendor-neutral Platform Integration Framework.

## Providers

- `sendgrid.email` — Twilio SendGrid Mail Send API.
- `twilio.sms` — Twilio Programmable Messaging REST API.

## Credential boundary

Both providers reuse the existing opaque `env:TRACE_INTEGRATION_*` credential-reference boundary. Provider secret values are resolved only at runtime and are not stored in integration connection rows, returned by platform APIs, or copied into audit metadata.

SendGrid credential bundle:

- `apiKey`

Twilio credential bundle:

- `accountSid`
- `authToken`

## SendGrid boundary

Allowed operation:

- `sendgrid.email.send`

The adapter accepts one recipient, a governed sender configured on the connection, a subject, and text and/or HTML content. Attachments, dynamic templates, caller-supplied personalizations, and other advanced provider features are excluded from this release. The host is fixed to the SendGrid global or EU API according to reviewed connection configuration.

## Twilio boundary

Allowed operation:

- `twilio.sms.send`

The adapter accepts one E.164 recipient, a governed E.164 sender configured on the connection, and a bounded SMS body. Media, messaging-service overrides, caller-supplied callback URLs, and arbitrary Twilio products are excluded. The REST host/path is fixed in code.

## Inbound callback boundary

Provider callbacks are intentionally disabled in PR 14.

SendGrid signed Event Webhook verification requires the original raw payload bytes plus provider signature/timestamp headers. The current generic inbound framework exposes the webhook body as a UTF-8 string, which is not a sufficient cryptographic boundary for a provider that explicitly requires unmodified raw bytes.

Twilio webhook validation depends on the exact callback URL plus request parameters and the `X-Twilio-Signature` header. The current generic inbound framework does not supply the canonical request URL/form boundary required for safe verification.

A later framework-hardening PR must add provider-safe raw-byte and canonical-request verification inputs before email/SMS status callbacks or inbound messages are enabled.

## Delivery semantics

The existing integration framework supplies durable queuing, bounded retry, dead-lettering, and reasoned requeue. Provider APIs do not provide a universal exactly-once guarantee for these send operations. A network failure after provider acceptance can therefore create duplicate-send risk on retry; operational monitoring and future provider-message correlation should account for this at-least-once boundary.

## Authority boundary

Neither provider receives tenant authorization, platform authorization, entitlement authority, approval authority, electronic-signature authority, or permission to mutate regulated QMS records.
