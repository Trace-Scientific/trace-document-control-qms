# PR 17 — AWS Secret Resolver & Credential Reference Hardening

Baseline: `main` at `11056b15e588c57f42056f59191c38ba10357a97`

## Included

- `aws-sm://trace-qms/validation/integrations/<name>` opaque credential references.
- ECS Fargate task-role credential resolution.
- AWS SigV4 Secrets Manager `GetSecretValue` requests using Node built-ins only.
- Validation-region restriction to `us-west-1`.
- Five-minute in-memory cache and 64 KiB string-secret ceiling.
- Governed resolver chain preserving `env:` only for synthetic preview.
- Least-privilege validation IAM policy artifact for the application task role.
- Regression coverage and architecture evidence.

## Explicit exclusions

- Production `aws-sm://trace-qms/production/...` references.
- OAuth refresh-token lifecycle or consent flows.
- Provider delivery correlation changes.
- New inbound provider callback enablement.
- Secret values in database records, logs, audit metadata, or API responses.
- Tenant QMS authorization changes.

## Deployment boundary

The IAM policy artifact is a foundation-level control and must be applied to the governed validation application task role before any `aws-sm://` integration connection is activated. Existing ECS execution-role injection of `DATABASE_URL` and `CRON_SECRET` remains unchanged.

Railway remains synthetic-data preview and should continue using approved `env:TRACE_INTEGRATION_*` references only. Protected validation uses the AWS resolver after the least-privilege task-role policy is deployed.
