# Sales Representative Account Scoping

Status: commercial administration authorization slice.

## Purpose

Enforce the commercial-administration requirement that an ordinary Sales Representative sees only the commercial accounts assigned to that representative, while a Sales Administrator retains the broader management view.

## Authorization model

The Sales workspace still requires `platform.sales.read`.

A user who also has `platform.sales.manage` receives administrative sales scope:

- all sales representatives;
- all sales assignments; and
- the active platform-identity selector needed to create representative profiles.

A user with `platform.sales.read` but without `platform.sales.manage` receives self scope:

- only the `SalesRepresentative` linked to the caller's `PlatformIdentity`; and
- only `SalesAssignment` rows belonging to that representative.

The active platform identity directory is not returned to self-scoped sales users.

## Data boundary

This restriction applies to Trace commercial control-plane data only. Sales ownership still does not create tenant memberships, tenant roles, tenant permissions, support access, or any other access to regulated QMS content.

## Management boundary

Create-representative and create-assignment operations continue to require `platform.sales.manage`. Read-only sales users therefore cannot reassign customers or create representative identities.

## UI

The Sales workspace now states whether it is operating in:

- **Administrative sales scope** — cross-sales visibility and management; or
- **Sales representative scope** — only the current representative's profile and assigned customer accounts.

## Acceptance contribution

This closes the remaining sales-visibility requirement that sales representatives see only authorized assigned commercial accounts while preserving historical effective-dated assignment records and the separate tenant authorization boundary.
