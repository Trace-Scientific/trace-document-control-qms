# Salesforce CRM Adapter

## Purpose

PR 13 adds the first CRM provider adapter on top of the vendor-neutral platform integration framework. Salesforce remains an external CRM transport, not an authorization, customer-account, subscription, entitlement, or regulated-record authority.

## Adapter boundary

Adapter key: `salesforce.crm`.

The first release supports three outbound create operations only:

- `salesforce.account.create`
- `salesforce.contact.create`
- `salesforce.opportunity.create`

The adapter accepts only a reviewed Salesforce instance origin ending in `.my.salesforce.com` or `.salesforce.com`, uses HTTPS only, and does not accept caller-provided URL paths, hosts, HTTP methods, record IDs, or Salesforce `attributes` metadata.

## Credentials

The platform connection stores only the existing opaque credential reference. The resolved deployment-secret bundle contains the current OAuth access token and Salesforce instance URL. Secret values are not written to platform integration tables, audit metadata, or API responses.

Salesforce recommends OAuth for REST API integrations. New connected-app creation is restricted beginning Spring '26, so production credential provisioning should use Salesforce's current external-client-app/OAuth guidance rather than introducing username/password authentication.

## API versioning

The adapter defaults to Salesforce REST's `latest` alias and optionally accepts an explicitly governed numeric API version. This avoids hard-coding a release that will age out while still allowing validated environments to pin a version when required.

## Inbound synchronization

Inbound Salesforce changes are intentionally not implemented in PR 13. Salesforce Change Data Capture is consumed through a Pub/Sub API or other supported subscriber rather than a simple signed HTTPS webhook. A later focused PR must implement subscriber authentication, channel selection, least-privilege permissions, schema/Avro decoding, replay position, reconnect behavior, idempotency, monitoring, and dead-letter semantics before inbound CRM synchronization is enabled.

## Governance

Salesforce cannot perform electronic signatures, approvals, role assignments, support-access grants, subscription/entitlement decisions, legal-hold release, or any other accountable-user act. Provider failures remain integration-delivery failures and cannot rewrite tenant QMS history.

## Validation boundary

Railway remains synthetic-data development preview only. Salesforce sandbox or developer-org credentials/data only are permitted in preview. Protected validation/production remains governed by the AWS release process.
