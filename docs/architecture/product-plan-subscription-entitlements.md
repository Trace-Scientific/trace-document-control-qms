# Product, Plan, Subscription & Entitlement Foundation

Status: PR 4 implementation baseline
Baseline: `main` after PR #243 (`63665969f07e408ef3c9034d52b4797b45655ee1`)

## Purpose

This change introduces the commercial product catalog, versioned plan configuration, customer subscriptions, entitlement overrides, and runtime entitlement resolution required by the approved Platform Expansion Implementation Plan.

The security rule remains:

> Commercial entitlement determines whether a customer has purchased/enabled a feature. Tenant RBAC independently determines whether an authenticated tenant user may perform an action. Neither layer replaces the other.

Runtime access therefore remains a conjunction of tenant/account state, feature entitlement, and tenant authorization.

## Catalog model

- `Product` groups commercially sold capabilities.
- `Feature` provides stable entitlement keys.
- `Plan` is a named commercial offering.
- `PlanVersion` freezes an effective version of a plan.
- `PlanFeature` records the feature matrix for one plan version.

Plan versions begin as `DRAFT`. Features may be edited only while their plan version is draft. Once a plan version becomes `ACTIVE`, database triggers prevent mutation of the plan-version row and its feature matrix. A new commercial configuration therefore requires a new version rather than rewriting historical configuration.

Feature definitions also have an explicit activation step. The entitlement resolver grants only active features.

## Subscription model

A `Subscription` belongs to one `CustomerAccount` and one active `PlanVersion`.

Initial status is `PENDING`. Governed transitions are:

- `PENDING -> ACTIVE | CANCELLED`
- `ACTIVE -> SUSPENDED | CANCELLED | EXPIRED`
- `SUSPENDED -> ACTIVE | CANCELLED | EXPIRED`
- `CANCELLED` and `EXPIRED` are terminal in this foundation.

Changes use optimistic locking through `lockVersion`. Each creation or lifecycle change creates an append-only `SubscriptionChange` record with actor identity, actor membership, reason, previous/new status, previous/new plan version, and metadata. Platform audit records are written in the same transaction.

## Entitlement overrides

`EntitlementOverride` provides an explicitly governed customer/feature exception with:

- `ENABLE` or `DISABLE` decision;
- effective start/end;
- required reason;
- creating Trace platform identity/membership;
- optional revocation with actor and reason.

Overrides require `platform.entitlement.manage` and are intentionally separate from ordinary subscription management.

## Resolution order

`resolveCustomerEntitlement()` evaluates:

1. an active customer account bound to the target tenant organization;
2. a currently effective, non-revoked explicit override for the requested active feature;
3. otherwise, a currently effective active subscription whose active plan version enables that active feature;
4. otherwise, not entitled.

Explicit overrides take precedence over plan-derived access so approved commercial exceptions are deterministic.

The resolver does not grant tenant RBAC permissions and does not call tenant authorization. Callers that expose a tenant QMS operation must separately authenticate the tenant user and enforce the required tenant permission.

## Platform permissions

- `platform.subscription.read` — read commercial catalog/subscription administration data.
- `platform.subscription.manage` — manage catalog, plan versions, and subscription lifecycle.
- `platform.entitlement.manage` — manage customer-specific entitlement overrides.

## Audit and historical integrity

Catalog creation/activation, subscription creation/change, and entitlement override creation/revocation write `PlatformAuditEvent` rows.

`SubscriptionChange` is protected from update/delete at the database boundary. Activated plan versions and their feature matrix are also protected from mutation.

There is no routine hard-delete subscription endpoint in this foundation.

## Provider independence

No Stripe, QuickBooks, CRM, payment processor, or other provider is the runtime entitlement authority. Future provider adapters may request internal subscription state changes, but the internal subscription and entitlement domain remains authoritative.

## Explicit exclusions

This PR does not add:

- Stripe or other billing-provider integration;
- accounting/CRM integration;
- sales or commission records;
- Platform Administration shell navigation;
- tenant QMS role/permission changes;
- cross-tenant regulated-content reporting.

Railway remains synthetic-data development preview only. Protected validation/production remains on the governed AWS path.