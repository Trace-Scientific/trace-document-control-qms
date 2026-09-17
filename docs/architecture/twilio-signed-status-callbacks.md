# Twilio Signed SMS Status Callbacks

Status: PR 20 focused provider callback enablement
Baseline: `main` at `ea63c7c4036b2796fb0ab4c45ce21761b898fd4c`

## Purpose

Enable the first signed provider delivery-status callback on the hardened PR 16 inbound boundary without weakening provider authentication or the PR 19 reconciliation model.

## Activation

Twilio status callbacks are opt-in per `twilio.sms` connection. Existing Twilio connections continue outbound-only behavior unless `callbackBaseUrl` is configured.

`callbackBaseUrl` must be a bare HTTPS origin. The adapter constructs the callback URL itself using the governed connection identity and the persisted outbound delivery idempotency key:

`<callbackBaseUrl>/api/platform/integrations/inbound/<connectionId>?deliveryKey=<idempotencyKey>`

Callers cannot provide `StatusCallback` in the outbound payload.

## Verification

Twilio status callbacks are accepted only when all of the following hold:

- the request is form encoded and all form parameters are preserved by the PR 16 boundary;
- the request origin matches configured `callbackBaseUrl`;
- the request targets the existing connection-scoped platform inbound route;
- the signed URL contains the bounded `deliveryKey` correlation value;
- `AccountSid` exactly matches the configured Twilio account;
- `X-Twilio-Signature` verifies against the exact request URL plus alphabetically ordered form fields using HMAC-SHA1 with the Twilio Auth Token;
- the callback contains a valid Twilio Message SID and a reviewed outbound message status.

Duplicate form-field names are rejected in this first slice rather than guessing provider canonicalization behavior.

## Correlation

The callback URL contains the original persisted Trace delivery idempotency key. Because the query string is part of Twilio signature calculation, the delivery correlation value is authenticated with the provider request.

The normalized event stores only bounded callback evidence:

- `deliveryKey`;
- `messageSid`;
- `messageStatus`;
- optional `errorCode`.

No message body, provider credential, auth token, or arbitrary callback parameter set is persisted in the normalized event.

## Reconciliation boundary

PR 20 proves signed provider identity and original-delivery correlation, but does not automatically mutate `PlatformIntegrationDelivery` reconciliation state. Automatic reconciliation from callbacks remains a separate controlled slice so status semantics and audit behavior can be reviewed independently.

## Security boundary

- Twilio does not gain tenant RBAC, platform RBAC, QMS accountable-user authority, or subscription authority.
- Callback configuration is not accepted from each outbound payload.
- The exact request URL is part of signature verification.
- `AccountSid` is checked in addition to the signature.
- Existing inbound body-size, raw-byte capture, receipt hashing, and duplicate handling remain unchanged.
- Existing outbound ambiguity handling remains unchanged.

## Explicit exclusions

- Incoming user SMS/message handling.
- MMS/media callbacks.
- Messaging Service-specific behavior.
- Automatic delivery reconciliation updates.
- SendGrid Event Webhook enablement.
- Salesforce CDC/Pub/Sub ingestion.
- QuickBooks or Zendesk callback changes.
