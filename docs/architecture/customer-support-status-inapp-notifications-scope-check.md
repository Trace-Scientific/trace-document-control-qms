# Customer Support Status Notification Scope Check

## Included

- In-app notification when Trace acknowledges a support request.
- In-app notification when Trace closes a support request.
- Original submitter only.
- Existing tenant NotificationOutbox and inbox.
- Deduplicated event keys.
- Transactional enqueue with the lifecycle transition.
- Customer-readable notification summary.
- Tests proving internal Trace reasons and support-access data are excluded.

## Explicitly excluded

- No email in this slice.
- No SMS.
- No tenant-wide broadcast.
- No internal Trace reasons in the payload.
- No platform audit data in the payload.
- No support request description or diagnostics in the payload.
- No SupportAccessRequest / SupportSession information.
- No Salesforce or Railway changes.

## Acceptance guardrail

A support status notification is a customer-facing lifecycle signal only. It must not expose internal Trace handling details or imply that privileged tenant support access was granted.
