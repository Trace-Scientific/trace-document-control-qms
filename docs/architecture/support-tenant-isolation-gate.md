# Support Tenant Isolation Gate

Status: platform/tenant isolation hardening slice.

## Purpose

Make the controlled-support tenant boundary explicit and reusable so future support-aware tenant routes cannot accidentally rely on platform authority alone.

## Central authorization gate

Support-aware tenant operations can now use:

`authenticateSupportTenantRequestForOrganization(request, organizationId, capability)`

The helper enforces, in order:

1. valid platform authentication;
2. `platform.support.access` through support-session authentication;
3. an active requester-bound support session;
4. exact equality between the requested tenant organization and the session's `targetOrganizationId`; and
5. the explicit support capability required by the route.

Platform authority by itself therefore remains insufficient for tenant access.

## Wrong-tenant behavior

A support session authorized for Tenant A is denied when used against Tenant B even when:

- the same Trace platform identity is authenticated;
- the user has broad platform permissions; and
- the session itself is otherwise active.

Wrong-target failures map to the same generic HTTP 403 support-access denial used for other authorization failures, avoiding unnecessary target-detail disclosure.

## Capability behavior

Exact tenant targeting does not imply write authority.

Routes must still request one of the explicit support capabilities, for example:

- `support.tenant.read`;
- `support.tenant.troubleshoot`; or
- `support.tenant.safe_write`.

Customer-only accountable actions remain separately prohibited.

## Tenant RBAC boundary

Ordinary tenant authorization remains unchanged and contains no platform, support, super-admin, or bypass semantics.

This preserves the rule that ordinary QMS requests operate in one authenticated tenant context, while cross-tenant work exists only through the separately authenticated controlled-support path.

## CI evidence

Focused regression coverage now proves:

- wrong-tenant support access is denied;
- exact-target access is accepted by the target gate;
- missing support capabilities are denied;
- the centralized helper composes active-session, tenant, and capability checks; and
- ordinary tenant authorization contains no platform/support bypass.

## Acceptance contribution

This directly strengthens Platform Administration acceptance criterion 7: CI/Security coverage demonstrates tenant isolation and platform-authorization boundaries, including attempts to cross tenant boundaries without the correct controlled support context.
