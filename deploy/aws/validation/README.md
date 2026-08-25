# AWS validation deployment package

This package is the reviewed runtime contract for the Trace QMS validation
environment. It deliberately does not contain account IDs, hostnames,
credentials, or secret values.

The approved primary region is `us-west-1`, the hostname is `traceqms.com`, and
the recovery class is Tier 1. Deploy `foundation.yaml` first with an explicit
`--region us-west-1` argument and a reviewed copy of the example parameters.
The foundation intentionally creates managed bootstrap credentials only. Create
a least-privilege application role and a separate `DATABASE_URL` runtime secret
before registering the service task definition.

After foundation approval, review `service.yaml` and the
[`AWS validation service preflight`](../../../docs/operations/aws-validation-service-preflight.md).
The service template creates the two-task ECS service, HTTPS load balancer,
`traceqms.com` Route 53 alias, log retention, autoscaling, and operational alarms.
It must not be deployed until the private-network migration procedure is ready.

## Required provisioned controls

- An approved AWS account and region dedicated to validation where practical.
- An HTTPS Application Load Balancer with a validated certificate.
- ECS Fargate tasks in private subnets without public IP addresses.
- A private, encrypted PostgreSQL 17 RDS database with automated backups and
  point-in-time recovery enabled.
- Security groups permitting load-balancer-to-task traffic on port 3000 and
  task-to-database traffic on port 5432 only.
- Secrets Manager entries for `DATABASE_URL` and `CRON_SECRET`.
- A CloudWatch log group with approved retention and alert routing.
- Synthetic validation data only.

## Template substitution

Create a reviewed task-definition artifact from `task-definition.json` by
replacing every `${NAME}` token. Do not use shell `eval`. The release job must
fail if an unresolved token remains.

| Token | Source |
| --- | --- |
| `EXECUTION_ROLE_ARN` | Validation infrastructure output |
| `TASK_ROLE_ARN` | Validation infrastructure output |
| `IMAGE_URI` | Approved ECR repository |
| `IMAGE_DIGEST` | Recorded `sha256:` image digest |
| `APP_BASE_URL` | Approved validation HTTPS origin |
| `APP_RELEASE_VERSION` | `0.1.0-rc.2` |
| `APP_RELEASE_SHA` | Full approved Git commit SHA |
| `DATABASE_URL_SECRET_ARN` | Secrets Manager identifier |
| `CRON_SECRET_ARN` | Secrets Manager identifier |
| `LOG_GROUP` | Validation log-group name |
| `AWS_REGION` | Approved region |

Register and deploy the rendered definition only after independent review. Run
`npx prisma migrate deploy` as a one-time protected release task before routing
traffic. Record the task-definition revision, image digest, migration output,
operator, and timestamps in the controlled deployment record.

## Prohibited shortcuts

- Do not use `latest` or another mutable image reference.
- Do not place database credentials or cron tokens in GitHub variables, task
  definition plaintext, logs, screenshots, or evidence artifacts.
- Do not give the application task permission to change infrastructure or read
  unrelated secrets.
- Do not expose RDS publicly or use production PHI/PII for validation.
- Do not approve production release from successful deployment alone; UAT,
  recovery evidence, and owner approvals remain mandatory.
