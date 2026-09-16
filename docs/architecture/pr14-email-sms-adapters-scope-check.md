# PR 14 Scope Check — Email/SMS Provider Adapters

## Baseline

- Base: `main`
- Base commit: `597270b858c9b88fb7c6791a06f934914cc67ad0`
- Predecessor: PR 13 — Salesforce CRM Adapter

## Included

- SendGrid outbound email adapter (`sendgrid.email`).
- Twilio outbound SMS adapter (`twilio.sms`).
- Reviewed runtime registration and platform exports.
- Existing deployment-secret reference boundary reused for provider credentials.
- Fixed provider hosts/paths and bounded send payloads.
- Regression/security tests.
- Architecture and validation-boundary documentation.

## Security decisions

- No provider credential values are persisted in application tables.
- No arbitrary provider URL, HTTP method, SendGrid personalization/attachment surface, or Twilio callback/media surface is exposed.
- No tenant QMS authorization or regulated-record authority changes.
- Provider callbacks remain disabled until the generic inbound framework can supply the exact cryptographic inputs required by each provider.
- SendGrid signed Event Webhooks are not approximated from a transformed string body.
- Twilio callback signatures are not approximated without the exact callback URL and form parameters.

## Explicit exclusions

- SendGrid Event Webhook ingestion.
- Twilio inbound SMS ingestion and outbound delivery-status callbacks.
- Marketing campaigns, contact-list management, bulk messaging, MMS, WhatsApp, voice, Verify, dynamic templates, and attachments.
- Automatic patient/client/tenant regulated communications.
- Provider opt-in/consent policy engines.
- Support-system adapters.
- Tenant authorization changes.

## Validation boundary

Railway remains synthetic-data development preview only. Any provider testing must use non-production/test credentials and synthetic destinations/content. Protected validation/production remains on the governed AWS release path.
