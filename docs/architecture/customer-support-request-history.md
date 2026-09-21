# Customer-Visible Support Request History

Status: launch-readiness slice
Baseline: `main` at `b5915cf5e1403602ea04366ce220b64bf0084892`

## Purpose

Allow an authenticated tenant user to see the status of support requests that the same user submitted from the Help Center.

## Visibility boundary

The customer history endpoint is constrained by both:

- authenticated tenant organization; and
- authenticated submitting user.

A user cannot use this endpoint to list support requests submitted by another user.

The response includes only:

- request identifier;
- subject;
- category;
- priority;
- status;
- submitted timestamp;
- acknowledged timestamp, when present;
- closed timestamp, when present.

The response intentionally excludes:

- support-request description;
- bounded diagnostics;
- Trace internal action reasons;
- PlatformAuditEvent content;
- controlled support-access cases;
- SupportAccessRequest records;
- SupportSession details;
- tenant-access capability information.

## Customer statuses

The Help Center presents:

- Open
- Acknowledged
- Closed

These are customer-facing intake statuses only. They do not indicate whether Trace has or had tenant support access.

## Caching and authentication

The endpoint requires the existing authenticated tenant session and returns `Cache-Control: no-store`.

## User experience

Help now includes a `My support requests` tab. It displays the current status and relevant timestamps for requests submitted by the signed-in user.

## Follow-on work

Future slices may add safe customer notifications when a request is acknowledged or closed, assignment/SLA controls for Trace, and optional linkage to a separately governed controlled support case.
