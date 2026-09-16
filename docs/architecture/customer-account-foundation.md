# Customer Account Foundation

Status: PR 2 implementation boundary
Baseline: post-PR #241 platform security foundation

## Purpose

The customer account layer represents Trace Scientific's commercial relationship with a customer without changing the customer's regulated QMS tenant identity. The existing `Organization` record remains the tenant identity for QMS authorization and governed records. `CustomerAccount` is a separate control-plane record.

## Ownership boundary

`CustomerAccount` owns commercial administration fields only:

- stable customer account identifier and account code
- legal/display names used by platform administration
- commercial lifecycle status
- optional commercial metadata
- optional one-to-one link to an existing tenant `Organization`
- optimistic lock version and timestamps

The foundation does not add subscription, entitlement, support-access, sales, commission, billing-provider, or CRM data.

## Tenant linkage

A `PROSPECT` may exist before a QMS tenant is provisioned, so `organizationId` is nullable. When linked, the database enforces a unique relationship to one `Organization` and uses `ON DELETE RESTRICT`.

Once a customer account has been linked to an organization, normal customer-account operations do not permit the tenant link to be reassigned or cleared. A customer account must be linked to a tenant organization before entering `ACTIVE` status.

This preserves the distinction between commercial lifecycle management and regulated tenant identity.

## Lifecycle

Supported states:

`PROSPECT -> ONBOARDING -> ACTIVE -> SUSPENDED`

Termination is allowed from `PROSPECT`, `ONBOARDING`, `ACTIVE`, or `SUSPENDED`. A terminated account is terminal in this foundation and cannot be edited through the customer-account service.

Restoration from `SUSPENDED` returns to `ACTIVE` and requires the elevated suspension capability.

Allowed transitions are:

- `PROSPECT -> ONBOARDING`
- `PROSPECT -> TERMINATED`
- `ONBOARDING -> ACTIVE`
- `ONBOARDING -> SUSPENDED`
- `ONBOARDING -> TERMINATED`
- `ACTIVE -> SUSPENDED`
- `ACTIVE -> TERMINATED`
- `SUSPENDED -> ACTIVE`
- `SUSPENDED -> TERMINATED`

`TERMINATED` has no outgoing transitions in PR 2.

## Authorization

All customer APIs use `authenticatePlatformRequest`; tenant roles are not accepted as platform authority.

- list/read: `platform.organization.read`
- create/edit and ordinary lifecycle advancement: `platform.organization.manage`
- suspend, restore from suspension, or terminate: `platform.organization.suspend`

The service layer performs authorization checks even when a route has already authenticated the platform request.

## Audit and history

Creation writes an initial `CustomerAccountStatusEvent` from no previous state to `PROSPECT`. Every status transition writes a new status event with the actual platform identity, membership, reason, prior state, and new state.

`CustomerAccountStatusEvent` is protected from UPDATE and DELETE by a database trigger. Its foreign key to `CustomerAccount` uses `ON DELETE RESTRICT`; because every customer receives an initial status event, routine hard deletion is also blocked at the database relationship boundary.

Create, edit, and lifecycle operations also write `PlatformAuditEvent` records with actor attribution, reason, entity version, and structured metadata. Platform audit remains protected by the append-only controls introduced in PR #241.

## Concurrency

Customer account updates and lifecycle transitions require `expectedLockVersion`. Operations lock the account row during the transaction and increment `lockVersion` after a successful change. Stale writes fail rather than silently overwriting a concurrent commercial change.

## API surface

PR 2 introduces:

- `GET /api/platform/customers`
- `POST /api/platform/customers`
- `GET /api/platform/customers/{customerAccountId}`
- `PATCH /api/platform/customers/{customerAccountId}`
- `POST /api/platform/customers/{customerAccountId}/status`

No customer DELETE endpoint is introduced.

## Validation and deployment boundary

The migration is additive and does not alter the existing `Organization`, tenant RBAC, tenant sessions, tenant audit, signatures, retention, or legal-hold tables.

Railway remains synthetic-data development preview only. Protected qualification/production deployment remains under the governed AWS release path. Subscription/entitlement enforcement and controlled support access are deferred to their approved later PRs.