# Commercial Catalog Administration Workspace

Status: commercial-packaging usability slice.

## Purpose

Allow authorized Trace platform administrators to manage the commercial product/module/plan catalog from Platform Administration without using raw API calls.

## Supported workflow

The workspace can:
- create a product;
- create a feature/module under a product;
- create a plan;
- create a new DRAFT plan version;
- set versioned commercial terms;
- set the draft feature/module matrix; and
- explicitly activate the completed plan version.

Activation remains a separate confirmed action. Activated plan versions and their feature matrix are immutable under the existing database/service controls.

## Pricing governance

No public plan price is hard-coded into the UI or service. Pricing, included-user counts, additional-user rates, storage allowances, and cadence are versioned data requiring platform management authority.

## Separation

Commercial feature/module entitlements do not create tenant RBAC permissions and do not rewrite governed QMS records. Customer subscription assignment remains in the adjacent governed subscription workflow.

## Validation focus

Coverage verifies consolidated catalog read access, reuse of governed mutation APIs, DRAFT-only configuration, explicit activation, immutable activated versions, integration with the subscription workspace, and absence of hard-coded target pricing.
