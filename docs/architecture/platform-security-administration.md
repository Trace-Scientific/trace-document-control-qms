# Platform Security Administration Workspace

Status: platform-administration launch-readiness slice.

## Purpose

Replace the placeholder Platform Security card with an operational least-privilege workspace for Trace platform roles and role assignments while preserving complete separation from tenant QMS authorization.

## Scope

Authorized users with `platform.security.manage` can:

- view existing platform identities and memberships with their current principal status;
- view platform roles and permission grants;
- create custom platform roles;
- replace the permission set of custom platform roles;
- assign custom roles to existing ACTIVE platform memberships; and
- remove custom-role assignments.

All role creation, permission changes, assignments, and unassignments require an attributable reason and append a `PlatformAuditEvent`.

## System-role protection

Roles marked `systemRole=true`, including the bootstrap-created **Platform Administrator** role, are read-only in this workspace.

The operational APIs refuse to edit their permissions or assign/unassign them. System-role provisioning remains controlled through the bootstrap process rather than routine UI administration.

This intentionally reduces accidental loss of the bootstrap recovery path and prevents routine operators from silently redefining privileged system roles.

## Least-privilege model

Custom roles may contain any subset of the stable `PLATFORM_PERMISSIONS` catalog, including an empty permission set when needed for staged configuration.

Assignments require both the target `PlatformIdentity` and `PlatformMembership` to be ACTIVE.

There is no universal shortcut role created by the workspace. Permission changes are explicit and auditable.

## Tenant boundary

Platform roles are stored only in:

- `PlatformRole`;
- `PlatformPermission`;
- `PlatformRolePermission`; and
- `PlatformMembershipRole`.

This workspace does not read or mutate tenant `Role`, `RolePermission`, tenant user-role assignments, organization-scoped grants, or tenant permissions.

A platform role assignment therefore never grants tenant QMS authority.

## Principal provisioning boundary

This slice administers roles for **existing platform memberships**. It deliberately does not turn any ordinary tenant user into a platform principal from the UI.

Initial or exceptional platform-principal provisioning remains a controlled separate process. A future slice may add a governed invite/provision lifecycle with stronger separation-of-duties controls if needed.

## Operational safeguards

- Workspace responses use no-store caching.
- System roles cannot be changed through these APIs.
- Duplicate role assignments are rejected.
- Unknown permission keys are rejected.
- All mutations require `platform.security.manage` and a reason.
