# Support Assignment and SLA Scope Check

## Included

- Optional Trace support owner.
- Only active platform members with platform.support.request may be selected.
- Response and closure due timestamps.
- Derived NONE / ON_TRACK / OVERDUE / MET queue states.
- Assignment/reassignment reason.
- Platform audit evidence.
- Trace-side owner/SLA display and controls.
- Database indexes for owner and due-date queue work.

## Explicitly excluded

- No automatic tenant support access.
- No SupportAccessRequest or SupportSession creation.
- No tenant RBAC changes.
- No customer exposure of internal assignee/SLA metadata.
- No automatic SLA defaults in this slice.
- No overdue escalation or notification in this slice.
- No Salesforce or Railway changes.

## Acceptance guardrail

Internal assignment means responsibility for the customer support intake record only. It must never be interpreted as authorization to enter or act within the tenant QMS.
