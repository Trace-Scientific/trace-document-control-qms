# Role-Aware Contextual Help Recommendations

Status: launch-readiness slice for Help Center issue #233.

## Purpose

Make contextual Help recommendations reflect the authenticated tenant user's existing QMS permissions instead of presenting the same operational suggestions to every user.

## Authorization boundary

The recommendation service consumes the server-created tenant `AuthorizationContext`.

It does not:
- accept requested permissions from the browser;
- add role grants;
- broaden scope;
- bypass workspace authorization;
- expose tenant record content; or
- change the authorization required by any linked QMS workflow.

A recommendation is shown only when at least one configured read/operate permission for that workspace is already present in the authenticated user's grants.

## Context behavior

The current bounded Help context is used only to order authorized recommendations. If the user is authorized for the current workspace, that recommendation is shown first. Other authorized workflows remain available as secondary recommendations.

Unknown context values are reduced to `help`.

## Initial recommendation domains

- controlled documents;
- review and approval queues;
- records;
- personnel;
- training and competency;
- quality events;
- equipment operations;
- reporting and analytics; and
- tenant administration.

The recommendation buttons execute ordinary published-Help searches. They do not expose unpublished Help content or controlled manual drafts.

## Validation focus

Automated tests prove:
- unauthorized domains are omitted;
- authorized current context is prioritized;
- inactive users receive no recommendations;
- permission input is derived server-side from the authenticated session; and
- the UI communicates that Help does not grant additional access.
