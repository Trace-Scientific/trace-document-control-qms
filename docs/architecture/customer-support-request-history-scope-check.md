# Customer Support History Scope Check

## Included

- Authenticated tenant GET path for support history.
- Organization-bound query.
- Customer-visible lifecycle status/timestamps.
- Help Center history display and refresh.
- Focused data-boundary tests.

## Explicitly excluded

- No Trace internal reasons.
- No platform identities or memberships.
- No PlatformAuditEvent exposure.
- No controlled support case or session details.
- No tenant-access information.
- No cross-tenant query.
- No Salesforce or Railway changes.

## Acceptance guardrail

The tenant view may show only the tenant's own submitted request content and customer-facing lifecycle state. Trace internal workflow evidence and privileged support-access data remain control-plane only.
