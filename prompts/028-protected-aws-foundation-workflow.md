# Prompt 028 — Protected AWS foundation workflow

## Objective

Create a manual, approval-gated plan/apply path for the Tier 1 validation
foundation without provisioning AWS resources from this source change.

## Delivered scope

- Add a dedicated `validation-foundation` GitHub environment gate using
  short-lived AWS OIDC credentials.
- Require an approved source SHA, controlled change reference, cost-review
  reference, and explicit ongoing-cost acknowledgment.
- Constrain database class, storage, and 35-day backup retention choices.
- Create a named, unexecuted CloudFormation change set during plan.
- On apply, verify the named change set, type, source SHA, change record, cost
  record, and every capacity parameter before execution.
- Support first-time foundation creation and controlled updates with the correct
  CloudFormation waiter and 90-day evidence artifacts.

## External prerequisites

- Configure required reviewers for the GitHub `validation-foundation`
  environment.
- Configure `AWS_VALIDATION_FOUNDATION_ROLE_ARN` with a least-privilege OIDC
  deployment role scoped to the foundation stack and approved resources.
- Configure `AWS_VALIDATION_ACCOUNT_ID` with the approved 12-digit validation
  account; the workflow fails if the OIDC identity resolves to another account.
- Complete and reference an AWS cost estimate covering Multi-AZ RDS, two NAT
  gateways, KMS, ECR, CloudWatch, and associated data transfer/storage.

## Deployment boundary

Merging this change does not run the workflow or create AWS resources. A plan
and apply each require a separate manual workflow invocation and environment
approval. Applying the foundation creates ongoing AWS charges.
