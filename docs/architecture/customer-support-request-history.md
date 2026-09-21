# Customer-Visible Support Request History

Status: launch-readiness slice
Baseline: `main` at `b5915cf5e1403602ea04366ce220b64bf0084892`

## Purpose

Allow authenticated tenant users to see the lifecycle state of support requests submitted through the Help Center without exposing Trace control-plane details or controlled support-access information.

## Tenant scope

The history query is constrained by the authenticated tenant authorization context:

`HelpSupportRequest.organizationId = context.organizationId`

No cross-tenant listing path is added.

## Customer-visible fields

The Help Center history exposes only:

- request identifier;
- subject;
- description originally submitted by the tenant user;
- category;
- priority;
- lifecycle status;
- submitted timestamp;
- acknowledged timestamp;
- closed timestamp.

It does not expose:

- Trace platform identity or membership;
- internal acknowledgement/closure reasons;
- PlatformAuditEvent metadata;
- controlled support case data;
- SupportAccessRequest records;
- support capabilities;
- SupportSession data;
- tenant-access activity.

## User experience

The Contact support tab now includes a My support requests section with:

- current OPEN / ACKNOWLEDGED / CLOSED state;
- submitted timestamp;
- acknowledgement timestamp when applicable;
- closure timestamp when applicable;
- manual refresh;
- automatic refresh after a successful new support submission.

## Caching

The tenant support history API returns `Cache-Control: no-store`.

## Follow-on work

Future slices may add safe customer notifications when status changes and optional tenant-visible resolution summaries designed specifically for customer disclosure.
