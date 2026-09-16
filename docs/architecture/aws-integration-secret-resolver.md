# AWS Integration Secret Resolver

Status: PR 17 production-readiness hardening

## Purpose

Replace the development-only integration credential lookup boundary with a governed AWS validation resolver while preserving opaque credential references in application data.

## Reference model

Validation integration connections may reference credentials only as:

`aws-sm://trace-qms/validation/integrations/<name>`

The resolver rejects production paths, arbitrary Secrets Manager names, alternate regions, and unknown credential schemes. Environment references remain supported only for synthetic preview through the separate `env:TRACE_INTEGRATION_*` resolver.

## Runtime trust boundary

The application uses the ECS task-role credential endpoint supplied by Fargate. No long-lived AWS access key is stored in application configuration or data. Secrets Manager requests are signed with AWS Signature Version 4 using Node built-in crypto/fetch, avoiding an additional runtime SDK dependency.

Only string secrets up to 64 KiB are accepted. Successful values may be cached in process memory for at most five minutes. Secret values are never written to integration tables, audit metadata, webhook receipts, or normalized events.

## IAM boundary

`deploy/aws/validation/integration-secrets-access.yaml` attaches a least-privilege inline policy to the application task role:

- `secretsmanager:GetSecretValue` only for `trace-qms/validation/integrations/*` in `us-west-1`;
- `kms:Decrypt` only on the governed validation KMS key and only via Secrets Manager.

The existing execution-role permissions for `DATABASE_URL` and `CRON_SECRET` remain unchanged.

## Failure behavior

Unknown schemes, invalid paths, wrong regions, unavailable ECS task credentials, Secrets Manager failures, binary/empty secrets, and oversized values fail closed with bounded configuration errors. Provider credentials are not returned through platform administration APIs.

## Production environment

This PR intentionally does not accept `trace-qms/production/...` references. Production support requires its own governed AWS stack, IAM namespace, KMS policy, and release evidence before the resolver is widened.
