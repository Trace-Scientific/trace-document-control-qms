# PR 19 — Provider Delivery Idempotency & Reconciliation Hardening

Baseline: `main` at `9533b540a76d8e8cb5b17a73da6252fb9ec649c5`

## Included

- `RECONCILIATION_REQUIRED` outbound delivery state.
- Provider request/object/outcome correlation metadata.
- Stale `PROCESSING` claims transition to reconciliation instead of automatic replay.
- Typed confirmed-provider rejection handling with bounded retry only where the provider clearly rejected the request.
- Stripe safe retry behavior using the original persisted provider idempotency key.
- Confirmed provider resource identifiers captured from Stripe, QuickBooks, Salesforce, Twilio, and Zendesk when returned.
- SendGrid accepted-message correlation header captured when returned.
- Accountable reconciliation resolution with explicit reason and platform audit evidence.
- Platform delivery API exposure of reconciliation evidence.
- Integration-health degradation while reconciliation items remain unresolved.
- Regression coverage and architecture evidence.

## Security invariants

- Ambiguous network/server outcomes are not blindly replayed for providers without a reviewed idempotency guarantee.
- No provider response body, credential, access token, or refresh token is stored as reconciliation evidence.
- Provider IDs are bounded metadata only and do not confer provider authority.
- Reconciliation requires `platform.integration.manage`.
- Resolution never changes tenant RBAC, platform RBAC, QMS accountable-user authority, or subscription entitlement authority.
- Reconciliation does not itself create a new provider-side object/message/ticket.

## Explicit exclusions

- New provider integrations.
- Browser-facing OAuth consent/callback routes.
- New inbound provider delivery-status callbacks.
- Salesforce CDC/Pub-Sub ingestion.
- Production AWS secret namespace changes.
- Automatic provider-side lookup/reconciliation when no verified provider lookup contract exists.

## Next controlled slice

PR 20+ may enable focused signed provider callbacks on the PR 16 inbound boundary. Provider callbacks must prove signature/canonical-request verification and correlation to the original outbound delivery before they can update delivery reconciliation state.
