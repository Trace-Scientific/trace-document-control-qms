# Prompt 010 — Notification Delivery and Inbox

## Goal
Turn the durable outbox into a concurrency-safe delivery subsystem with a recipient-owned in-app inbox and administrator failure controls.

## Delivered behavior
- Review escalations fan out to active users granted `document.review.manage`; no cross-tenant or inactive recipient is selected.
- Workers claim tenant-scoped batches atomically with PostgreSQL `FOR UPDATE SKIP LOCKED` and recover abandoned five-minute leases.
- Successful delivery records attempt count and delivery time.
- Failed delivery uses bounded exponential backoff and moves to `DEAD_LETTER` after five attempts.
- Error details are length-limited and provider failures are not exposed through the API.
- In-app inbox queries and read updates require the authenticated recipient identity and tenant.
- Administrators with `notification.manage` can inspect failed/dead-letter deliveries and explicitly requeue dead letters; requeue actions append audit evidence.
- Notification state invariants are enforced by database constraints.

## Boundary
The in-app transport is operational. Email delivery is represented by a transport interface and fails safely until a provider is configured in a future deployment/integration increment. Scheduling infrastructure is deployment-specific and is not claimed here.

## Validation
Unit tests cover success, retry, dead-letter transition, inbox ownership, read behavior, monitoring, and requeue authorization. CI validates migrations, database integrity, security audit, TypeScript, lint, tests, and production build.
