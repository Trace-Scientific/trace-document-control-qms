# Controlled Support Access Operations Workspace

Status: Platform Administration support-access usability slice.

## Purpose

Make the existing controlled cross-tenant support-access controls operational for authorized Trace personnel without weakening the underlying two-person approval, time-bound session, capability, or tenant-authorization boundaries.

## Workflow

The dedicated `/support-access` surface now supports the complete controlled sequence:

1. Review an existing controlled support case.
2. Request tenant access for a bounded duration of 5–240 minutes.
3. Select one or more approved support capabilities.
4. Require a different platform member with `platform.support.approve` to approve or deny the request.
5. Permit only the original approved requester with `platform.support.access` to issue and assume the session.
6. Display the persistent controlled-support banner while the browser holds the HTTP-only session cookie.
7. Allow the requester to exit the session.
8. Allow an authorized approver to revoke an active session.
9. Allow a case to close only after active sessions are gone.

## Permission-aware workspace

The support-access read model returns only the operational data needed by users who hold at least one support permission:

- `platform.support.request`;
- `platform.support.approve`; or
- `platform.support.access`.

The workspace reports the caller's exact authority so UI controls remain aligned with server-side enforcement.

## Separation of duties

The service continues to reject self-approval:

`requestedByMembershipId === approvingMembershipId`

is not permitted.

The approved requester binding is also preserved: another platform member cannot issue the session even if they hold `platform.support.access`.

## Session safeguards

Sessions remain:

- requester-bound;
- opaque-token based;
- stored using only a token hash;
- HTTP-only / SameSite strict in the browser;
- explicitly expiring;
- revocable;
- capability-scoped; and
- auditable.

Expired sessions are marked EXPIRED when authentication detects the time boundary.

## Customer-only action boundary

Controlled support access still cannot perform customer-only actions such as:

- electronic signatures;
- document/workflow approvals;
- legal-hold release; or
- tenant security-role/membership administration.

Support safe-write auditing continues to correlate both tenant and platform audit records to the support session and support case.

## Data boundary

This workspace displays control-plane support metadata and target organization identity required for explicit tenant selection. It does not provide unrestricted tenant-record browsing and does not create tenant RBAC grants.

The existing support-aware authorization layer remains the only route by which approved support capabilities may be used.
