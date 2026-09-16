# PR 13 Scope Check — Salesforce CRM Adapter

## Included

- Reviewed `salesforce.crm` runtime registration.
- Existing opaque deployment-secret credential boundary reused for OAuth access token + instance origin.
- HTTPS-only, allowlisted Salesforce instance hosts.
- Outbound Account, Contact, and Opportunity creation only.
- REST API `latest` alias by default, with optional pinned numeric API version.
- Existing platform delivery retry/dead-letter behavior reused.
- Regression/security tests and provider architecture documentation.

## Explicitly excluded

- Salesforce Change Data Capture / Pub/Sub API subscriber.
- CometD/Streaming API subscriber.
- Salesforce Platform Events ingestion.
- OAuth consent UI, external-client-app provisioning, refresh-token storage, or token rotation.
- Record update/delete/upsert, bulk API, metadata API, Apex, SOQL query surfaces, or arbitrary sObject access.
- Automatic sales attribution, commission, subscription, entitlement, or tenant-QMS state mutation.
- Salesforce-triggered electronic signatures, approvals, role changes, or support access.

## Security boundary

- Tenant RBAC is unchanged.
- `platform.integration.manage` remains the platform administration permission boundary.
- Provider secret values remain outside platform integration tables.
- Callers cannot select arbitrary Salesforce hosts, paths, verbs, or object names.
- Create payloads cannot supply Salesforce `Id` or `attributes` fields.
- Inbound synchronization fails closed until a reviewed streaming subscriber is implemented.

## Validation boundary

Railway is synthetic preview only. Use Salesforce sandbox/developer-org data and non-production credentials in preview. Production remains on the governed AWS release path.
