# Platform Integration Framework

## Purpose

PR 10 establishes the vendor-neutral control-plane integration boundary required before any provider-specific integration is allowed into Trace QMS.

## Trust boundary

Platform integrations are governed by `platform.integration.manage` and remain independent from tenant QMS authorization. A connected provider is never an authorization authority for either platform or tenant actions.

`PlatformIntegrationConnection` stores adapter identity, lifecycle state, non-secret configuration, and an opaque `credentialRef`. Secret values are intentionally resolved outside the application database through `PlatformCredentialResolver`.

## Adapter contract

`PlatformIntegrationAdapter` defines two provider-neutral capabilities:

- outbound `deliver(...)` for a normalized event and configuration;
- inbound `verifyAndNormalizeWebhook(...)`, which must verify provider authenticity before returning a normalized internal event.

PR 10 registers no provider adapters. A connection cannot transition to ACTIVE unless its adapter is registered in the reviewed runtime composition. Provider-specific PRs will add one adapter at a time with provider-specific threat modeling.

## Outbound delivery

Outbound events are durable `PlatformIntegrationDelivery` rows with a connection-scoped idempotency key. Workers claim eligible rows using PostgreSQL `FOR UPDATE SKIP LOCKED`, recover abandoned five-minute leases, and retry with bounded backoff. Five failed attempts move a delivery to `DEAD_LETTER`.

Dead-letter replay requires `platform.integration.manage`, an ACTIVE connection, and an explicit reason. Replay resets delivery state but preserves the original event identity/idempotency key and appends platform audit evidence.

## Inbound receipt

The generic inbound route accepts only a connection identifier, raw request body, headers, and an idempotency key. Core framework code does not interpret provider signatures. The registered adapter must verify authenticity and normalize the event before `PlatformIntegrationNormalizedEvent` is created.

Only a SHA-256 digest of the raw webhook body is preserved in receipt metadata. The normalized event is append-only. Connection-scoped idempotency prevents duplicate receipt processing.

## Credential boundary

`credentialRef` is an opaque reference only. PR 10 ships `UnavailableCredentialResolver`, which fails closed when a credential reference exists. Provider-specific work must supply a controlled secret-management implementation rather than storing tokens, API keys, refresh tokens, or client secrets in platform integration tables.

## Health and administration

Platform System Health reports aggregate integration connection/delivery state only. Platform Administration exposes draft connection creation, connection visibility, delivery monitoring, and reasoned dead-letter replay. Because PR 10 has no registered provider adapters, newly created connections remain DRAFT until a later provider PR registers the corresponding adapter.

## Explicit exclusions

- Provider-specific adapters or credentials.
- Stripe, QuickBooks, Salesforce, Office Ally, Twilio, SendGrid, or other vendor logic.
- Tenant QMS integration authority changes.
- Provider-triggered signatures, approvals, role changes, or other accountable-user actions.
- Cross-tenant regulated-content export engines.
- Secret-management infrastructure implementation.

## Validation boundary

Railway remains synthetic-data development preview only. Provider credentials and regulated customer data are not permitted in preview. Protected qualification/production continues through the governed AWS release path.
