# Platform Administrator Bootstrap

Status: preview-only controlled provisioning utility

## Purpose

Provision one already-existing authenticated QMS user into the separate Trace platform authorization domain without reusing tenant roles as platform authority.

## Controls

- Requires an explicit existing user email through `PLATFORM_BOOTSTRAP_USER_EMAIL`.
- Requires `PLATFORM_BOOTSTRAP_CONFIRM=PROVISION-PLATFORM-ADMIN`.
- Refuses ambiguous or missing user matches.
- Creates or reactivates the linked `PlatformIdentity` and `PlatformMembership`.
- Creates/updates the system `Platform Administrator` role.
- Binds the current platform permission catalog to that role.
- Assigns the role idempotently to the selected platform membership.
- Records every controlled run in append-only `PlatformAuditEvent`.
- Does not create tenant roles, tenant grants, or tenant authorization bypasses.

## Preview execution boundary

Railway preview remains synthetic-data development only. Run the command only as a controlled one-off after the merged image is deployed. Remove `PLATFORM_BOOTSTRAP_*` variables immediately after use.

Expected command:

`npm run platform-admin:bootstrap`

The command is safe to repeat for the same selected user; a repeated run verifies/restores the intended platform role binding and records a verification audit event rather than creating duplicate assignments.
