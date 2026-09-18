# Zendesk Signed Ticket Event Reconciliation

Status: PR 26 integration hardening
Baseline: `main` at `7bc0082c23222f8eeb6fad48f6771fba2f6b6973`

## Purpose

Harden the existing Zendesk Support adapter so signed native ticket events can safely update provider-status evidence and resolve ambiguous ticket-creation outcomes without granting Zendesk any Trace authorization authority.

## Outbound correlation

`zendesk.ticket.create` now reserves Zendesk `external_id` for a Trace-owned correlation value:

`trace-delivery:<integration delivery idempotency key>`

The value is opaque platform correlation only. Callers cannot supply an arbitrary Zendesk external ID in this slice.

The first ticket comment remains forced to `public: false`.

## Signed ticket-event boundary

The existing Zendesk webhook authenticity boundary remains:

- `X-Zendesk-Webhook-Signature`
- `X-Zendesk-Webhook-Signature-Timestamp`
- HMAC-SHA256 over timestamp + raw body
- constant-time comparison
- five-minute replay window

Only native Zendesk ticket-event payloads are accepted for governed reconciliation.

This slice accepts:

- `zen:event-type:ticket.created`
- `zen:event-type:ticket.status_changed`

The normalized event is `zendesk.ticket.delivery_status` and preserves only:

- Trace delivery key
- Zendesk ticket ID
- bounded ticket status
- Zendesk event type
- provider event ID

Ticket subject, description, requester identity, assignee identity, tags, and raw provider payload are not copied into normalized status evidence.

## Reconciliation semantics

A verified ticket event can mutate a governed delivery only when:

1. the active Zendesk integration connection has already verified the webhook;
2. the native ticket event contains a Trace-managed `external_id`;
3. the delivery key maps to exactly one outbound delivery on that connection;
4. any previously stored provider ticket ID matches the callback ticket ID.

For `RECONCILIATION_REQUIRED`, a verified event proves the Zendesk ticket exists. Trace resolves the outbound provider-request ambiguity to `SUCCEEDED` while preserving the ticket's current downstream state separately as `ZENDESK_<STATUS>`.

For already-resolved deliveries, the event updates provider-status evidence only.

A Zendesk status event never authorizes a new ticket, automatic retry, dead-letter replay, support-access grant, tenant mutation, or QMS accountable-user action.

## Audit and governance

Provider-generated reconciliation writes append-only platform audit evidence using:

- `platform.integration.delivery.reconciled_by_provider_callback`
- `platform.integration.delivery.provider_status_observed`

No human actor identity is fabricated for provider callbacks.

## Explicit exclusions

- Zendesk ticket update/delete/merge operations.
- Zendesk user, organization, role, macro, trigger, automation, SLA, or view administration.
- Automatic support-access grants.
- Automatic retry/replay/ticket recreation.
- Arbitrary customer-managed Zendesk external IDs.
- Tenant QMS mutation from Zendesk state.
- Database migration.
- Railway resource mutation.
- Protected AWS provisioning.

## Validation boundary

Railway remains synthetic-data development preview only. Zendesk testing must use synthetic support content and a sandbox/test account. Formal validation/production remains on the governed AWS path.
