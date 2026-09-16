# PR 15 — Zendesk Support Adapter Scope Check

## Included

- Adapter key `zendesk.support` registered through reviewed platform runtime composition.
- Existing opaque deployment-secret credential boundary reused for Zendesk API token and webhook signing secret.
- Fixed Zendesk Support ticket-create endpoint derived only from a validated Zendesk subdomain.
- Bounded `zendesk.ticket.create` outbound event.
- Internal (`public: false`) initial ticket comment.
- Signed Zendesk webhook verification using timestamp + raw body HMAC-SHA256 and a five-minute replay window.
- Existing platform receipt idempotency, normalized-event persistence, retry/dead-letter, audit, and reasoned requeue behavior reused.
- Regression/security tests and provider architecture documentation.

## Security and governance guardrails

- Tenant `AuthorizationContext` and tenant QMS RBAC are unchanged.
- Zendesk never becomes platform, tenant, or support-access authorization authority.
- Provider credential values are resolved only at runtime and are never stored in integration tables.
- Callers cannot provide arbitrary URLs, methods, ticket IDs, assignees, groups, requester identities, macros, triggers, or admin actions.
- Webhooks are not normalized until signature and timestamp verification succeeds.
- Provider events cannot directly mutate regulated tenant data or accountable-user actions.

## Explicit exclusions

- Ticket update/delete/merge, bulk APIs, search, macros, triggers, automations, SLA management, views, user/org administration, or agent provisioning.
- Automatic Trace support-access grants/revocations from Zendesk state.
- Automatic tenant QMS, subscription, entitlement, commission, or billing state mutation.
- Production Zendesk credential provisioning.

## Provider decision record

The approved provider sequence named the support-system category but did not name a vendor. Zendesk Support is an implementation choice for PR 15, not a previously approved vendor requirement and not an exclusive platform dependency.

## Validation boundary

Railway remains synthetic-data development preview only. Zendesk provider testing must use non-production credentials and synthetic support content. Protected validation/production remains on the governed AWS release path.
