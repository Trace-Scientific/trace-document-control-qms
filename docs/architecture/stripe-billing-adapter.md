# Stripe Billing Adapter

Status: PR 11 provider-specific integration

## Purpose

This adapter is the first provider-specific implementation built on the vendor-neutral Platform Integration Framework. It supports a bounded Stripe billing/subscription transport without making Stripe the runtime authority for Trace QMS subscriptions, entitlements, tenant authorization, signatures, approvals, or regulated records.

## Adapter identity

- Adapter key: `stripe.billing`
- Runtime registration occurs only in `src/lib/platform/integration-runtime.ts`.
- A platform integration connection cannot become ACTIVE unless this reviewed adapter is present in the runtime registry.

## Credential boundary

The integration connection stores only an opaque credential reference such as `env:TRACE_INTEGRATION_STRIPE_PRIMARY`.

The referenced deployment secret is JSON containing provider credentials, for example the logical fields `apiKey` and `webhookSecret`. Secret values are never stored in the integration tables, returned by the platform API, or written to audit metadata.

The environment credential resolver accepts only `TRACE_INTEGRATION_*` references and fails closed when the reference or secret is unavailable.

## Outbound boundary

Initial outbound operations are intentionally narrow:

- `stripe.customer.create` -> `POST /v1/customers`
- `stripe.subscription.create` -> `POST /v1/subscriptions`

The adapter uses the durable platform delivery idempotency key as Stripe's `Idempotency-Key` header. Retries therefore preserve the same logical provider request identity.

No arbitrary Stripe URL, HTTP method, or provider endpoint can be supplied by platform users through the integration payload.

## Inbound webhook boundary

The route preserves the exact raw request body. If a provider does not send a Trace idempotency header, the platform derives a SHA-256 digest of the raw body for receipt idempotency.

The adapter validates the `Stripe-Signature` header using HMAC-SHA256 over `<timestamp>.<rawBody>`, enforces a five-minute timestamp tolerance, and compares signatures with a timing-safe comparison. JSON parsing and event normalization occur only after signature verification succeeds.

Initially accepted Stripe event types are:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `checkout.session.completed`

All other Stripe event types fail closed rather than being treated as trusted normalized events.

## Authority boundary

Stripe can provide billing/subscription facts to the internal integration event stream, but those facts do not directly mutate Trace subscription or entitlement state in this PR. Future domain handlers may request governed internal state transitions, but Trace's internal subscription/entitlement domain remains authoritative.

Stripe never receives tenant QMS authorization authority and cannot perform customer signatures, approvals, role assignment, legal-hold release, or other accountable-user actions.

## Validation boundary

Railway remains synthetic-data development preview only. Use Stripe test-mode credentials only in preview. Live Stripe credentials belong only in governed protected deployment configuration.
