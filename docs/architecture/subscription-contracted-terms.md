# Subscription Contracted / Grandfathered Terms

Status: commercial packaging launch-readiness slice.

## Purpose

Support customer-specific contracted or grandfathered subscription economics without mutating the public plan catalog or duplicating tenant authorization.

## Model

A Subscription may now carry optional immutable contract overrides for:

- billing cadence;
- currency;
- base subscription amount;
- included full users;
- additional-user rate;
- storage allowance; and
- a non-secret commercial terms note.

Each field is nullable.

A null contract field means the subscription inherits the corresponding value from its referenced immutable PlanVersion.

## Effective terms

The operational subscription workspace resolves each effective commercial term as:

`COALESCE(subscription contract override, plan-version term)`

This lets a customer remain pinned to the activated plan version while also preserving negotiated terms that differ from the catalog.

## Immutability

Contracted terms are captured only when the Subscription is created.

A database trigger rejects later UPDATE changes to any contracted-term field. This prevents a later operator from silently rewriting the commercial history of an existing customer.

If commercial terms must change, the governed approach is to create a new subscription/contract arrangement rather than edit the historical contract.

## Validation

- currencies must use a three-letter code;
- monetary/user/storage values must be non-negative integers;
- the optional contract note is capped at 1000 characters.

All contract values are included in the existing subscription creation audit evidence and SubscriptionChange metadata.

## Reporting

Monthly recurring revenue now uses effective contracted terms:

- MONTHLY uses the effective base amount;
- ANNUAL divides the effective base amount by 12;
- CUSTOM remains excluded from normalized MRR;
- currencies remain separated rather than FX-converted.

Therefore commercial reporting no longer assumes catalog list price when a customer has negotiated/grandfathered terms.

## Tenant boundary

Contracted pricing remains platform commercial control-plane data only. It does not create tenant roles, tenant permissions, document authority, support access, or any other regulated QMS privilege.

## Acceptance contribution

This closes the explicit commercial-packaging requirement for customer-specific grandfathered pricing/terms while preserving:

- versioned public plan pricing;
- immutable historical commercial evidence;
- configurable monthly/annual cadence;
- user/storage allowances;
- entitlement separation from RBAC; and
- future billing-provider integration.
