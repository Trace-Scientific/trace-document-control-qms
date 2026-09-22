# Customer Commercial Profile

Status: commercial administration profile slice.

## Purpose

Move commonly reported commercial customer attributes out of unstructured metadata and into first-class validated Platform Administration fields while keeping them separate from regulated tenant QMS records.

## First-class customer fields

`CustomerAccount` now supports:
- lead/source;
- contract date/time;
- renewal date/time;
- onboarding charge in minor currency units; and
- discount in basis points.

Validation prevents negative onboarding charges, discounts outside 0–100%, and renewal dates at or before a known contract date.

## Single-source boundaries

The customer profile deliberately does **not** duplicate:
- subscription plan;
- billing cadence;
- subscription base amount;
- enabled modules/features; or
- subscription lifecycle status.

Those values remain governed by `Subscription`, immutable `PlanVersion`, and entitlement records. Platform users see/manage them in **Subscriptions & entitlements**.

Sales ownership also remains in the effective-dated `SalesAssignment` domain, and commission attribution remains in the commission domain.

## Governance

Profile changes:
- require `platform.organization.manage`;
- require a reason;
- use the existing customer optimistic lock version;
- write platform audit evidence; and
- cannot edit terminated customer accounts.

The fields contain commercial control-plane data only. They do not grant tenant membership, roles, document access, support access, or any other QMS privilege.

## UI behavior

The Customers workspace displays the commercial profile and provides an authorized edit action. The shared customer loader also now loads customer accounts when entering Customers, Subscriptions & entitlements, or Sales, eliminating a prior dependency on first opening the Customers tab.
