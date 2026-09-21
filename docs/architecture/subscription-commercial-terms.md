# Versioned Subscription Commercial Terms

Status: commercial-packaging foundation slice.

## Purpose

Represent business-approved subscription terms on immutable plan versions instead of embedding public prices or user allowances in application code.

## Fields

Each `PlanVersion` may define while DRAFT:

- billing cadence: MONTHLY, ANNUAL, or CUSTOM;
- ISO-style three-letter currency;
- base subscription amount in minor currency units;
- included full-user count;
- optional additional full-user rate;
- optional storage allowance in GiB; and
- structured commercial metadata for approved terms that do not warrant first-class fields yet.

A plan version cannot be activated until cadence, currency, base amount, and included full-user count are present.

## Grandfathering

A `Subscription` references a specific activated `PlanVersion`. Activated plan versions are already immutable. Therefore an existing subscription can remain on its contracted plan version while a later version carries new pricing or allowances.

Changing the customer plan uses the existing governed subscription-transition path and preserves append-only `SubscriptionChange` history.

## Boundaries

Commercial terms do not alter tenant RBAC, signatures, regulated records, or historical QMS data. Feature entitlements remain a separate commercial layer resolved through plan features and effective-dated overrides.

No Starter/Professional/Business/Enterprise price is hard-coded by this slice. Public pricing remains configurable and subject to business approval.

## Validation focus

Automated coverage verifies cadence and pricing fields, non-negative values, activation prerequisites, draft-only mutation, platform audit evidence, and absence of hard-coded public price targets.