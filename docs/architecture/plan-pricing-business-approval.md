# Plan Pricing Business Approval

Status: commercial packaging acceptance hardening.

## Purpose

Make the existing requirement that public/commercial pricing be business-approved explicit and attributable in the governed platform catalog.

## Activation boundary

A draft PlanVersion cannot be activated unless its core commercial terms are complete:

- billing cadence;
- currency; and
- base amount.

Activation now also requires an explicit business-approval basis.

The approval evidence records:

- approval timestamp;
- approving platform identity;
- approving platform membership; and
- approval reason/basis.

The activation action continues to require `platform.subscription.manage` and produces the existing platform audit event.

## Immutability

Once business approval has been recorded, a database trigger prevents that approval evidence from being changed.

Activated PlanVersion pricing and packaging remains immutable under the existing catalog lifecycle. A later pricing change therefore requires a new draft PlanVersion and a new explicit business approval.

## Public-pricing boundary

This change does not introduce fixed Trace price constants and does not publish pricing to a public website.

Pricing values remain configurable catalog data.

The internal cost/margin and competitive-analysis workspace remains advisory planning evidence; it does not automatically approve or publish a price.

## Customer contracts

Existing customer subscriptions may remain on their activated PlanVersion and may separately carry immutable contracted/grandfathered terms. Activating a later PlanVersion does not rewrite existing customer economics.

## Acceptance contribution

This closes the commercial-packaging criterion that public pricing remain configurable and business-approved rather than embedded as immutable application constants.
