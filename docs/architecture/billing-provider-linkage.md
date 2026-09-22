# Billing Provider Linkage and Verified Event Observations

Status: commercial billing-integration readiness slice.

## Purpose

Provide a controlled boundary between Trace's authoritative commercial subscription domain and external billing-provider object identity.

The first supported adapter is the already reviewed `stripe.billing` integration. The data model is provider-neutral enough to preserve internal identity if a different billing provider is introduced later.

## Provider links

A `BillingProviderLink` associates one active integration connection with either:

- a Trace `CustomerAccount` and provider customer object ID; or
- a Trace `Subscription` and provider subscription object ID.

Provider IDs remain secondary references. They never replace Trace UUIDs or tenant/QMS record identity.

Link creation requires:
- an ACTIVE reviewed `stripe.billing` connection;
- `platform.integration.manage`;
- the correct provider object ID shape (`cus_...` or `sub_...`); and
- an attributable reason.

Revocation is historical: the link is timestamped/reasoned as revoked rather than deleted.

## Verified inbound observations

After the integration framework verifies a Stripe webhook signature and normalizes the event, the inbound transaction records a `BillingProviderEventObservation`.

The observation contains:
- the governed webhook receipt;
- connection and provider event identity;
- normalized event type;
- provider object identity when present;
- a link to an active billing-provider mapping when a correlation is found; and
- SHA-256 of the normalized payload.

Observation rows are append-only.

## Authority boundary

This slice deliberately does **not** make Stripe authoritative for Trace subscription or entitlement state.

Verified provider events are evidence for later reconciliation/domain handling. The observation code does not update `Subscription`, `PlanVersion`, `EntitlementOverride`, tenant roles, signatures, approvals, or regulated QMS records.

Any future provider-driven internal subscription transition must enter through a separately reviewed governed domain handler with explicit mapping, transition rules, idempotency, audit evidence, and failure/reconciliation behavior.

## Security and credential boundary

Provider credentials remain in the existing restricted integration credential resolver. This linkage layer stores provider object IDs only, never API keys or webhook secrets.

## Acceptance contribution

This provides the missing billing-provider integration readiness required by the commercial packaging backlog while preserving Trace's internal commercial domain as the system of authority.
