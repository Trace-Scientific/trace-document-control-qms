# Customer Support Status In-App Notifications

Status: launch-readiness slice
Baseline: `main` at `305e138c299175265fd8487867e38eb54bf5b774`

## Purpose

Notify the original tenant user when Trace acknowledges or closes a Help support request, using the existing tenant notification outbox and recipient-owned QMS inbox.

## Channel

This slice uses `IN_APP` only.

Email is intentionally excluded so this workflow does not depend on a configured outbound email provider and does not move support-request status information outside the authenticated QMS.

## Recipient boundary

The notification is addressed only to:

- the same tenant organization that owns the support request; and
- the user who originally submitted that support request.

No tenant-wide broadcast is created.

## Events

Two customer-facing notification templates are emitted:

- `HELP_SUPPORT_ACKNOWLEDGED`
- `HELP_SUPPORT_CLOSED`

Each event has a deterministic event key tied to the support request and status so the existing unique outbox constraint prevents duplicate notifications.

## Payload boundary

The customer notification payload contains only:

- support request identifier;
- short request reference;
- subject;
- customer-facing status;
- Help Center path.

It does not contain:

- Trace acknowledgement/closure reason;
- platform identity or membership data;
- platform audit metadata;
- support request description;
- diagnostics;
- credentials;
- controlled support-access case/session data.

## Transactional behavior

The support status transition and notification enqueue occur in the same database transaction.

If notification enqueue fails, the status transition does not commit.

## Inbox rendering

The existing QMS notification drawer recognizes support status payloads and renders a concise customer-readable summary such as:

- Support request ab12cd34 · Acknowledged
- Support request ab12cd34 · Closed

## Follow-on work

Future work may add a governed optional email channel after provider configuration and tenant notification preferences are defined.
