# Commercial Pricing Analysis

Status: pre-launch commercial packaging analysis slice.

## Purpose

Provide Trace with a governed internal planning workspace for plan economics and competitive pricing observations without hard-coding or automatically publishing public prices.

## Plan cost assumptions

Each PlanVersion may have one current cost-assumption record containing:

- monthly infrastructure cost;
- monthly support cost;
- monthly operations cost;
- payment fee basis points;
- payment fixed fee;
- one-time onboarding cost;
- assumption date; and
- notes.

Cost assumptions are separate from the versioned catalog price. Updating an assumption does not mutate the PlanVersion or any customer subscription.

Optimistic locking protects updates to an existing assumption.

## Gross-margin calculation

For MONTHLY plan versions:

`normalized monthly revenue = base amount`

For ANNUAL plan versions:

`normalized monthly revenue = annual base amount / 12`

CUSTOM cadence is intentionally not normalized.

Estimated recurring monthly cost is:

`infrastructure + support + operations + percentage payment fee + fixed payment fee`

One-time onboarding cost is displayed separately and is not silently mixed into recurring gross margin.

Estimated recurring gross margin is:

`normalized monthly revenue - estimated recurring monthly cost`

The percentage shown is a planning estimate, not an accounting-system result.

## Competitive observations

The workspace can record competitor pricing observations with:

- competitor name;
- offering name;
- billing cadence;
- currency;
- observed amount;
- included users;
- required source label;
- optional source URL;
- required observation date; and
- notes.

The model intentionally requires the observation date/source because competitor pricing changes over time.

The application does not claim these observations are current unless a user has entered current source evidence.

## Governance and permissions

- Read requires `platform.subscription.read`.
- Mutations require `platform.subscription.manage`.
- Cost-assumption changes and competitor observations require a reason and append platform audit evidence.
- Responses use no-store caching through the API workspace.
- Pricing analysis remains platform commercial control-plane data only.

## Public-pricing boundary

This workspace does not publish prices to customers or make planning assumptions authoritative contractual terms.

Public pricing remains configurable and subject to explicit business approval. Contracted/grandfathered customer terms remain governed separately on Subscription.

## Acceptance contribution

This provides the pre-launch business-analysis foundation required to document infrastructure, support, operations, onboarding, payment costs, expected recurring gross margin by plan version, and dated/source-attributed competitive pricing observations.
