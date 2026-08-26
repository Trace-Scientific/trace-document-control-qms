# Prompt 025 — Private-network migration contract

## Objective

Close the deployment blocker for forward-only Prisma migrations against the
private RDS database and ensure ECS runs images matching the architecture built
by the current CI environment.

## Delivered scope

- Correct the ECS runtime platform from ARM64 to x86-64 to match the current
  GitHub-hosted Docker build.
- Add a dedicated, non-root migration image target containing Prisma CLI and
  migrations but no application server entrypoint.
- Add a digest-addressed, one-time Fargate migration task contract that receives
  only `DATABASE_URL` from Secrets Manager.
- Build the migration target in CI with the exact version and full source SHA.
- Define evidence and fail-closed execution requirements before application
  traffic is enabled.

## External prerequisites

- Foundation and service IAM outputs required to register and run the task.
- Immutable application and migration image digests from the same source SHA.
- Least-privilege database URL secret and private application subnet IDs.
- Controlled operator and change/evidence reference.

## Acceptance checks

- CI and Security pass on the final head.
- Application and migration task architectures are both x86-64.
- Migration image runs only `prisma migrate deploy` as a non-root user.
- Migration task is addressed by digest and receives no cron secret.
- A nonzero or missing container exit code blocks service deployment.
