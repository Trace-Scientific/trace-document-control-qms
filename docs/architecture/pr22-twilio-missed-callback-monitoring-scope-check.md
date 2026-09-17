# PR 22 — Twilio Missed-Callback Recovery and Delivery-Status Monitoring

Baseline: `main` at `1681fdfb3dc9991f60a311cbc1122e8d50ce044a`

## Included

- Adds provider-status polling only for governed Twilio SMS deliveries that already have a persisted valid Message SID.
- Uses authenticated Twilio GET status lookup; no send/replay method is present in the polling service.
- Resolves `RECONCILIATION_REQUIRED` to `SUCCEEDED` only when Twilio returns the exact persisted Message SID.
- Preserves downstream Twilio status independently in `providerOutcome`.
- Adds separate provider-status polling evidence fields instead of reusing outbound send-attempt timestamps.
- Records bounded polling errors without changing retry eligibility.
- Exposes polling evidence in platform integration operations.
- Degrades platform integration health for recent Twilio downstream failures or recent polling errors.
- Adds an authenticated `platform.integration.manage` operator endpoint for invoking due polls.
- Adds regression/security tests and architecture documentation.

## Security invariants

- Polling cannot enqueue an outbound delivery.
- Polling cannot requeue a dead letter.
- Polling cannot POST a new Twilio Message.
- A delivery without a persisted Message SID is not eligible for automated polling reconciliation.
- The provider response SID must match the persisted provider object ID exactly.
- Connection status must still be ACTIVE before polling evidence is applied.
- Provider polling never fabricates a human reconciliation actor.
- `failed`, `undelivered`, and `canceled` downstream states never authorize an automatic resend.
- No tenant RBAC, platform RBAC, QMS accountable-user, entitlement, OAuth, or support-access authority is expanded.

## Operational semantics

`SUCCEEDED` continues to mean the platform has evidence that Twilio created the original Message. The actual Twilio downstream delivery state remains separately visible in `providerOutcome`.

For already-successful deliveries, polling adds or refreshes provider-status evidence without rewriting the original `deliveredAt` timestamp.

For ambiguous deliveries with a known Message SID, a successful exact-resource GET proves the Message exists and safely resolves the provider-request ambiguity.

## Scheduler boundary

This PR does not claim recurring scheduler deployment. The poller is available through a governed platform operation. Automated recurring invocation remains a separate deployment decision after scheduler ownership, cadence, concurrency, and alert routing are reviewed.

## Explicit exclusions

- Automatic resend after Twilio downstream delivery failure.
- Polling or replay for ambiguous deliveries without a Message SID.
- Incoming SMS handling.
- SendGrid status polling.
- New provider callback families.
- Production scheduler deployment.

## Next controlled slice

After this PR, review scheduler execution ownership and production alert routing for the bounded Twilio poller, then decide whether to harden the next provider callback/status family or continue platform observability work.
