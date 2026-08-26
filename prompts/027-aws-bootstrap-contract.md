# Prompt 027 — AWS migration bootstrap contract

## Objective

Make the protected release workflow safe for the first service deployment by
provisioning migration prerequisites in the qualified foundation stack.

## Delivered scope

- Move the ECS cluster, encrypted application log group, and separate application
  and migration execution/task roles into `foundation.yaml`.
- Restrict migration to `trace-qms/validation/database-*`; restrict application
  startup to that database secret plus `trace-qms/validation/cron-*` and the
  foundation KMS key.
- Export every bootstrap resource and require the service template to consume
  those outputs instead of creating duplicates.
- Fail closed when GitHub environment variables differ from qualified
  foundation outputs.
- Permit reviewed CloudFormation `CREATE` and `UPDATE` change sets while always
  requiring the private migration task to exit successfully first.

## Acceptance checks

- Foundation and service templates have one clear owner for every bootstrap
  resource.
- First-time service creation cannot execute before successful migration.
- Failed or missing migration evidence blocks both create and update.
- CI, infrastructure contract tests, and secret scans pass.

## Deployment boundary

This source change does not create or modify AWS resources. Foundation and
service stack operations require a separately approved protected workflow run.
