# Twilio Missed-Callback Recovery and Delivery-Status Monitoring

Status: PR 22 integration hardening
Baseline: `main` at `1681fdfb3dc9991f60a311cbc1122e8d50ce044a`

## Purpose

Add a bounded provider-status polling path for Twilio SMS deliveries after the signed callback and callback-driven reconciliation work in PRs 20 and 21.

The polling path is intentionally observational. It can confirm that an already-correlated Twilio Message exists and can record its downstream status, but it cannot create a message, enqueue a delivery, replay a dead letter, or otherwise authorize an automatic resend.

## Recoverable missed-callback cases

Polling is allowed only for governed `twilio.sms.send` deliveries that already contain a syntactically valid persisted Twilio `MessageSid` in `providerObjectId`.

For a `RECONCILIATION_REQUIRED` delivery with that existing Message SID, a successful authenticated Twilio GET response whose returned SID matches exactly proves that the original provider object exists. The platform may therefore resolve the provider-request ambiguity to `SUCCEEDED` while preserving the returned downstream message status independently in `providerOutcome`.

This mirrors the PR 21 callback status model: provider acceptance/existence and downstream delivery state are separate concepts.

## Non-recoverable ambiguity

A `RECONCILIATION_REQUIRED` delivery without a persisted Twilio Message SID is not eligible for automated polling reconciliation. Twilio status lookup requires a Message SID; attempting a new send to discover whether the original succeeded could create a duplicate communication.

Those cases remain in the accountable human reconciliation workflow from PR 19.

## Poll cadence and evidence

Eligible non-terminal Twilio deliveries become poll candidates after two minutes. A delivery is polled no more than once every fifteen minutes through this service.

Polling evidence is stored separately from outbound send-attempt evidence:

- `providerStatusCheckedAt`
- `providerStatusCheckCount`
- `providerStatusError`

`lastAttemptAt` remains the outbound delivery-attempt timestamp and is not reused for polling.

Terminal observed Twilio outcomes are:

- `TWILIO_DELIVERED`
- `TWILIO_UNDELIVERED`
- `TWILIO_FAILED`
- `TWILIO_CANCELED`
- `TWILIO_READ`

Terminal outcomes are not repeatedly polled by this slice.

## Authentication and correlation

The polling service uses the governed credential resolver for the active Twilio connection and performs an authenticated GET of the exact Message resource under the configured Twilio account.

The returned `sid` must exactly equal the persisted `providerObjectId`, and the returned provider status must be one of the reviewed Twilio message statuses before any delivery evidence is updated.

A connection that is no longer ACTIVE cannot receive a polling-driven state update.

## Reconciliation behavior

When polling confirms the exact Message SID for a `RECONCILIATION_REQUIRED` delivery:

- Trace status becomes `SUCCEEDED` from the platform-to-provider request perspective;
- `providerOutcome` records the current Twilio downstream status;
- `reconciliationReason` becomes `TWILIO_PROVIDER_POLL_CONFIRMED_MESSAGE_EXISTS`;
- `deliveredAt` is set only if it was not already populated;
- no human reconciliation actor is fabricated;
- an append-only system audit event `platform.integration.delivery.reconciled_by_provider_poll` is written.

For an already-`SUCCEEDED` delivery, polling updates only provider-status evidence and never rewrites the original `deliveredAt` timestamp.

## Polling failures

Credential, network, HTTP, SID-mismatch, and unsupported-status failures are recorded in `providerStatusError` and an append-only `platform.integration.delivery.provider_status_poll_failed` audit event.

A polling failure does not change delivery retry eligibility and does not create a resend path.

## Operational monitoring

Platform system health is degraded when either of these conditions is observed:

- a Twilio downstream `FAILED`, `UNDELIVERED`, or `CANCELED` state occurred on a delivery from the last 24 hours;
- a Twilio provider-status poll error occurred within the last hour.

The integration operations delivery list also exposes provider status check time, check count, and current polling error evidence.

## Invocation boundary

This PR adds an authenticated platform operation for explicitly invoking due polling. The caller must hold `platform.integration.manage`.

The existing system-health model still reports the platform scheduler as `NOT_CONFIGURED` unless `PLATFORM_SCHEDULER_CONFIGURED=true`. PR 22 does not claim that recurring infrastructure scheduling has been deployed.

A later deployment slice may schedule this already-bounded polling operation after scheduler ownership, cadence, concurrency, and production alert routing are approved.

## Explicit exclusions

- Automatic resend after any Twilio provider status.
- Polling ambiguous deliveries that lack a persisted Message SID.
- Changing PR 19 human reconciliation authority.
- Incoming SMS handling.
- SendGrid callback or polling reconciliation.
- New tenant, QMS, subscription, OAuth, or support-access authority.
- Claiming that recurring scheduler infrastructure is configured.
