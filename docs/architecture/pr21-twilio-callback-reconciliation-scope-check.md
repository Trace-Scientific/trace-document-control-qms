# PR 21 — Twilio Callback-Driven Delivery Reconciliation

Baseline: `main` at `c3072a303acfcd443991dbd3beb7ea0fb652a742`

## Included

- Applies only verified `twilio.sms.status` normalized events to outbound delivery evidence.
- Correlates by governed integration connection and original persisted delivery idempotency key.
- Locks the matching delivery before applying callback evidence.
- Rejects Message SID conflicts instead of replacing existing provider correlation.
- Resolves only `RECONCILIATION_REQUIRED` outbound ambiguity to `SUCCEEDED` when a signed callback proves Twilio created the Message.
- Preserves Twilio downstream status independently in `providerOutcome`.
- Never converts `failed` or `undelivered` callbacks into an automatic retry.
- Writes append-only system audit evidence for automated reconciliation and provider-status observation.
- Adds regression coverage and architecture documentation.

## Security invariants

- Signature/account/canonical-request verification from PR 20 remains mandatory and occurs before reconciliation.
- Connection ID and delivery key are correlation values, not authentication factors.
- Existing Message SID correlation cannot be silently replaced.
- Provider callbacks cannot enqueue sends or invoke dead-letter replay.
- Provider-generated audit evidence does not fabricate a human actor.
- Human reconciliation actor fields remain reserved for operator-driven PR 19 resolution.
- No tenant authorization, platform role, QMS accountable-user, entitlement, or support-access authority changes.

## Status interpretation

A callback proves provider acceptance because a Twilio Message SID exists. Therefore an ambiguous Trace provider-delivery attempt may safely resolve to `SUCCEEDED` even when the later Twilio message state is `failed`, `undelivered`, or `canceled`. The downstream state remains separately recorded in `providerOutcome` and does not authorize a resend.

## Explicit exclusions

- Automatic resend after Twilio downstream delivery failure.
- New Twilio outbound features.
- Incoming SMS workflows.
- SendGrid callback reconciliation.
- Provider polling for missed callbacks.
- New schema or RBAC changes.

## Next controlled slice

After this PR, the integration hardening sequence should review missed-callback reconciliation/polling and operational delivery-status monitoring before enabling another provider callback family.
