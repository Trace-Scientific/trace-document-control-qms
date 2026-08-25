# Prompt 022 — rc.2 identity and AWS validation package

## Objective

Preserve immutable release traceability after Prompt 021 and define a secret-safe
AWS runtime contract without representing an unqualified environment as ready
for production.

## Delivered scope

- Candidate version advanced to `0.1.0-rc.2`.
- OCI version and source-revision labels plus runtime release environment.
- Liveness release identity with fail-closed production validation.
- Qualification reconciliation of version, full Git SHA, and OCI digest.
- Secret-free ECS Fargate task-definition template and deployment control guide.
- Updated release-candidate and approval evidence templates.

## External prerequisites

- AWS account, region, validation hostname, and accountable owners.
- Provisioned private network, load balancer, RDS PostgreSQL 17, ECR, Secrets
  Manager, CloudWatch, IAM roles, backup policy, and alert routing.
- A short-lived validation session, GitHub protected environment, UAT testers,
  and approved recovery objectives.

## Acceptance checks

- Production startup rejects a missing or malformed candidate identity.
- The validation smoke test rejects a deployment whose version or SHA differs
  from the approved candidate.
- CI builds the OCI image with the exact workflow commit and manifest version.
- The AWS template references the image by digest and secrets by provider
  identifier; no secret value is source controlled.
- CI, Security, validation-configuration tests, and the production build pass.
