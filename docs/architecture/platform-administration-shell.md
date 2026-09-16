# Platform Administration Shell

Status: PR 5 implementation architecture
Baseline: `main` after PR #244 (`eab38ba07c10b9a35237f55d8f7051c3c72b9a10`)

## Purpose

Provide Trace Scientific with a distinct control-plane UI without turning the tenant QMS shell into a cross-tenant administration surface.

## Boundary

- Tenant QMS remains rooted at `/` and continues to use `QmsModuleShell`, tenant session organization context, tenant role grants, and workspace visibility.
- Platform Administration is rooted at `/platform` and uses `PlatformAdministrationShell`.
- The platform shell does not import tenant workspace visibility or tenant authorization grants.
- `/api/platform/me` authenticates the current human through the existing session but returns only the independent `PlatformAuthorizationContext` grants.
- All underlying platform APIs continue to enforce server-side platform authorization; navigation visibility is not treated as a security boundary.

## Initial navigation

The approved control-plane navigation is represented as:

- Overview
- Customers
- Subscriptions & entitlements
- Support access
- Sales
- Commissions
- Help content
- Platform audit
- System health
- Integrations
- Platform security

Navigation is permission-aware. A platform member only sees a domain when at least one relevant platform permission is present. The Overview itself is always available after platform authentication.

## Current implementation status

### Available

- Customers: reads the existing governed Customer Account foundation.
- Support access: links to the existing case-bound controlled support access surface.

### Foundation-visible

- Subscriptions & entitlements: identifies the existing catalog/subscription/entitlement foundation without adding billing-provider integration.
- Platform audit: identifies the append-only platform audit foundation; a dedicated browser remains future work.
- Platform security: identifies the independent platform identity/membership/RBAC foundation.

### Reserved for later focused PRs

- Sales
- Commissions
- Help content
- System health
- Integrations

These entries are not implemented early. They are shown only when the relevant permission exists and are explicitly labeled as planned.

## Security properties

1. No platform role or permission is added to tenant `AuthorizationContext`.
2. The tenant homepage remains the tenant QMS surface and does not import the platform shell.
3. The platform shell consumes only the server-derived platform permission list.
4. Every data operation continues to be protected by its platform API/service permission check.
5. Support access remains a separate time-bound support session; the shell does not create an impersonation shortcut.
6. No unrestricted cross-tenant regulated-content browser is introduced.
7. No sales, commission, billing-provider, Help Center, health, or integration business logic is introduced in this PR.

## Validation boundary

Railway remains synthetic-data development preview only. Protected validation and production remain on the governed AWS path.
