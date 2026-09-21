# Trace Support Assignment and SLA Tracking

Status: launch-readiness slice
Baseline: `main` at `d460e998b79a2995ee6ae0cf5cdcba4ee905bf4b`

## Purpose

Give authorized Trace support personnel explicit ownership and operational response/closure targets for customer Help requests without changing the controlled tenant-access model.

## Assignment

An active support request may be assigned to one active PlatformIdentity whose active PlatformMembership carries `platform.support.request`.

Assignment stores the platform identity, assignment timestamp, optional response due timestamp, and optional closure due timestamp.

Closed requests cannot be assigned or reassigned.

## SLA tracking

Response and closure targets are explicit timestamps rather than hidden policy calculations in this slice.

Queue state is derived as:

- NONE when no target exists;
- ON_TRACK before the target;
- OVERDUE after the target while the milestone remains incomplete;
- MET after acknowledgement for response or closure for closure.

A closure target cannot be earlier than the response target. New SLA targets must be future timestamps.

## Audit

Assignment/reassignment and SLA changes require a reason and write a PlatformAuditEvent with the target organization, resulting request status, assignee identity, and due timestamps.

## Security boundary

Assignment is control-plane work ownership only. It does not create or authorize:

- SupportAccessRequest;
- SupportAccessApproval;
- SupportSession;
- tenant impersonation;
- tenant RBAC membership;
- QMS mutation authority.

If the assigned Trace owner later needs tenant access, the existing separately governed support-access process still applies.

## Customer visibility

Assignment owner and SLA targets are Trace-side operational metadata and are not added to the customer Help history in this slice.

## Follow-on work

A later slice may add policy-driven SLA defaults, overdue escalation/notifications, and support operational reporting.
