# Prompt 011 — Operational Workspace UI

## Goal
Connect periodic reviews, recipient notifications, and administrator delivery monitoring to the Document Control workspace without weakening server-side tenant or permission controls.

## Delivered behavior
- A single authenticated dashboard endpoint derives the tenant from the active session rather than accepting a browser-supplied organization identifier.
- The workspace loads live notification, periodic-review, and delivery-failure data when authenticated and retains a clearly labeled demonstration fallback otherwise.
- The notification bell displays an unread count and opens a recipient-owned inbox; marking read calls the protected notification API.
- The review queue displays only current effective versions returned by the review service, with visible overdue status and dates.
- The administration view displays failed and dead-letter deliveries only for users granted `notification.manage`.
- Dead-letter recovery is available only when eligible and uses the audited requeue API.
- Permission-limited users receive explicit access states without sensitive counts or diagnostics.
- Responsive layouts, keyboard focus behavior, semantic labels, and empty states are preserved.

## Boundary
Document rows remain validation/demo records until the document listing endpoint is implemented. Live data is explicitly labeled and no patient information is used.

## Validation
Dashboard summary tests cover unread, overdue, and failure counts. The complete CI suite validates TypeScript, lint, unit tests, database integrity, and production rendering.
