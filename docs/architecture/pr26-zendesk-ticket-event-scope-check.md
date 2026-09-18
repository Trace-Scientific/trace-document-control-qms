# PR 26 Scope Check — Zendesk Signed Ticket Event Reconciliation

## Included

- Reserve Zendesk ticket `external_id` for Trace delivery correlation.
- Preserve private first-comment behavior.
- Retain Zendesk HMAC-SHA256 signature verification and five-minute replay protection.
- Accept only native ticket-created and ticket-status-changed events.
- Normalize only bounded ticket/status/correlation evidence.
- Correlate verified events to governed outbound deliveries under row lock.
- Resolve `RECONCILIATION_REQUIRED` only when a signed event proves the original ticket exists.
- Preserve status-only updates for already-resolved deliveries.
- Write append-only provider callback audit evidence.
- Add signature, replay-window, allowlist, data-minimization, correlation, and no-auto-retry tests.

## Explicitly excluded

- No ticket recreation, retry, replay, or automatic provider write from callback state.
- No support-access grant or tenant/QMS authorization change.
- No arbitrary Zendesk external ID from outbound callers.
- No broad Zendesk administration or synchronization.
- No database migration.
- No Railway resource mutation.
- No protected AWS provisioning.

## Acceptance guardrail

No Zendesk callback may mutate delivery state unless the request passes the existing signature/replay checks and the native ticket event carries the Trace-managed `external_id` correlation value for exactly one governed outbound delivery.
