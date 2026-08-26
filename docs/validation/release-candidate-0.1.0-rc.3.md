# Release candidate 0.1.0-rc.3

## Purpose

This candidate adds the protected AWS validation release control. It does not
represent a deployed, validated, or production-approved system.

## New release controls

- Manual GitHub `validation` environment gate with required reviewers.
- Short-lived AWS authentication through GitHub OIDC; no static AWS access keys.
- Exact commit and package-version verification.
- Immutable `linux/amd64` application and migration images addressed by digest.
- Separate plan and apply operations using a named CloudFormation change set.
- Private Fargate migration task with public IP disabled.
- Fail-closed activation after migration exits successfully.
- Non-secret plan/apply metadata retained as workflow evidence for 90 days.
- Separate protected foundation plan/apply with cost acknowledgment and exact
  source, change, cost, and capacity verification.

## External prerequisites

The workflow is inert until the GitHub environment, OIDC trust, least-privilege
AWS role, repository variables, ECR repository, certificate, DNS zone, secrets,
and foundation networking exist. The foundation now owns the ECS cluster,
separate application and migration execution/task roles, and encrypted log group
needed before migration. The apply path verifies those outputs, runs migration
first, and supports both first-time service creation and later updates.

## Approval boundary

Creating a plan publishes two images and creates an unexecuted change set.
Applying requires a new protected approval plus the exact change-set name and
digests. Successful automation is evidence, not validation approval; UAT,
recovery exercises, and controlled owner approval remain separate.
