# Prompt 024 — AWS validation service layer

## Objective

Define the production-aligned application service layer for the approved
`us-west-1` validation foundation without deploying resources or enabling
scheduled production behavior prematurely.

## Delivered scope

- Public multi-AZ Application Load Balancer with TLS 1.2/1.3 policy, HTTPS
  redirect, invalid-header rejection, deletion protection, and Route 53 apex
  alias for `traceqms.com`.
- Private ECS Fargate service with two tasks, rolling minimum availability,
  deployment rollback, readiness checks, immutable image digest, autoscaling,
  disabled public IPs, and no execute-command access.
- Least-privilege task execution access to only the database and cron secrets.
- KMS-encrypted, 365-day retained application logs and Container Insights.
- Encrypted SNS alerts for unhealthy targets and load-balancer 5xx responses.
- Deployment preflight covering cost, DNS, certificate, migration, secrets,
  rollback, alert subscription, and evidence.
- Scheduled overdue monitor is skipped until `MONITOR_ENABLED=true`; manual runs
  remain fail-closed for configuration verification.

## External prerequisites

- Foundation stack deployed and its outputs recorded.
- Issued ACM certificate and Route 53 hosted-zone ID.
- Immutable ECR image digest, full release SHA, and runtime secret ARNs.
- Confirmed alert email and SNS subscription.
- Private-network database migration mechanism.
- Reviewed cost estimate and AWS deployment identity.

## Acceptance checks

- CI and Security pass on the final head.
- Service template contains no credentials or mutable image reference.
- At least two private tasks remain required during deployments and scaling.
- Only the load balancer can reach application port 3000.
- Scheduled monitoring does not fail before deployment, while manual execution
  still verifies required configuration.
