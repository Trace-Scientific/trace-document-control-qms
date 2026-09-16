# Platform Security & Data Foundation

Status: PR 1 implementation architecture
Governing plan: `docs/architecture/platform-expansion-implementation-plan.md`

## Purpose

This foundation creates a Trace Scientific control-plane authorization domain without weakening or extending tenant QMS authorization. Ordinary tenant requests remain bound to the organization carried by the authenticated QMS session.

## Trust boundary

The tenant authorization context remains unchanged and organization-bound. The platform authorization context contains only platform identity, platform membership, principal states, and platform permission grants. It intentionally contains no `organizationId`, tenant role, tenant scope, or tenant permission grant.

Platform request authentication currently reuses the already validated QMS session only to establish the human actor identifier. It then resolves an independently governed `PlatformIdentity` and active `PlatformMembership`; platform grants are loaded exclusively through `PlatformMembershipRole -> PlatformRolePermission -> PlatformPermission`. Tenant grants are never copied into the platform context.

This arrangement permits shared authentication infrastructure while preserving independent authorization domains. A tenant administrator receives no platform authority unless an explicit platform identity/membership and platform role assignment exist.

## Foundation data ownership

PR 1 introduces these control-plane records:

- `PlatformIdentity` — maps the authenticated human actor into the platform domain and has an explicit status.
- `PlatformMembership` — grants participation in the Trace platform administration domain and has an independent status.
- `PlatformRole` — named permission bundle.
- `PlatformPermission` — stable platform capability key.
- `PlatformMembershipRole` — membership-to-role assignment, including optional assigning membership.
- `PlatformRolePermission` — role-to-permission assignment.
- `PlatformAuditEvent` — append-only platform event history.

No platform role or permission record references tenant `Role`, tenant `Permission`, tenant `UserRole`, site scope, department scope, or tenant authorization grants.

## Platform status vocabulary

Platform identity and membership states are explicit and shared across the foundation implementation:

- `ACTIVE`
- `INACTIVE`
- `LOCKED`
- `PENDING`

Only `ACTIVE` identity plus `ACTIVE` membership is eligible for a platform authorization context.

## Permission catalog

Stable keys are defined in `src/lib/platform/permissions.ts` and inserted by the additive migration. Roles remain governed bundles rather than hard-coded authorization decisions.

## Audit protection

`PlatformAuditEvent` records actor identity/membership where applicable, occurrence time, action, entity identity/version, request/correlation identifiers, reason, hashes where useful, and structured metadata.

The migration installs a PostgreSQL trigger that rejects `UPDATE` and `DELETE` operations on `PlatformAuditEvent`, mirroring the established tenant audit immutability pattern. Corrections must be represented by subsequent platform audit events rather than destructive mutation.

## Explicit exclusions

This foundation does not implement:

- customer account management;
- support tenant access or impersonation;
- subscriptions or entitlements;
- sales or commissions;
- Help Center/manual UI;
- platform administration UI;
- external provider integrations.

Those capabilities remain dependent follow-on PRs under the approved implementation plan.

## Required regression behavior

Before merge, CI must demonstrate that existing tenant authorization remains unchanged, platform authorization fails closed without an active membership and explicit permission, platform roles cannot satisfy tenant permission checks, the platform audit mutation trigger is present, and the normal lint/typecheck/test/Prisma/build gates remain successful.

## Deployment boundary

Railway remains synthetic-data development preview only. This migration follows the existing committed-migration startup contract. Protected validation and production qualification remain separate governed AWS activities and require a future post-rc.5 candidate/release decision.
