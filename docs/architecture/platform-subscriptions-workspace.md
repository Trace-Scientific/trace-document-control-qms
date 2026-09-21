# Platform Subscriptions & Entitlements Workspace

Status: commercial-packaging usability slice.

## Purpose

Replace the placeholder Platform Administration subscription cards with an operational workspace backed by the existing governed subscription and entitlement services.

## Read model

The workspace shows:

- active plan versions and their versioned commercial terms;
- customer subscriptions with current lifecycle state and optimistic lock version; and
- active effective-dated entitlement overrides.

The read model requires `platform.subscription.read`.

## Governed actions

Users with `platform.subscription.manage` may:

- assign an active tenant-linked customer to an active plan version;
- create the subscription in PENDING state; and
- move it through only the transitions already permitted by the subscription service.

Every mutation continues to require a reason, write platform audit evidence, and preserve append-only `SubscriptionChange` history.

## Separation of concerns

Subscription and entitlement state remains commercial control-plane data. It does not grant tenant permissions, replace tenant RBAC, change signatures/approvals, or rewrite regulated QMS records.

Existing customers remain pinned to the activated plan version referenced by their subscription, preserving contracted/grandfathered terms until an authorized plan transition occurs.
