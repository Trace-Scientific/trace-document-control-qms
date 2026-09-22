# Customer Entitlement Override Administration

Status: commercial-packaging usability slice.

## Purpose

Allow authorized platform administrators to create and revoke effective-dated customer feature/module overrides from Platform Administration.

## Permissions

Viewing the Subscriptions & Entitlements workspace continues to require platform subscription-read authority.

Creating or revoking an override requires the separate `platform.entitlement.manage` permission. Subscription-management authority alone does not expose these controls.

## Workflow

An authorized operator selects:
- an active tenant-linked customer account;
- an active commercial feature/module;
- ENABLE or DISABLE;
- an effective start date (current time from the UI in this slice); and
- a required reason.

Revocation also requires a reason. Existing service logic writes platform audit evidence and marks the override revoked rather than deleting historical attribution.

## Boundary

Entitlement overrides are commercial feature-access decisions. They do not create tenant roles or permissions, do not alter signatures/approvals, and do not delete or rewrite governed QMS records.
