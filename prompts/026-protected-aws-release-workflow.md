# Prompt 026 — Protected AWS release workflow

## Objective

Create a manual, approval-gated AWS validation deployment path for
`0.1.0-rc.3` in `us-west-1` without deploying infrastructure from this change.

## Acceptance criteria

- GitHub OIDC supplies short-lived credentials in the protected environment.
- Plan and apply are explicit, separate operations.
- The SHA is a full commit on `main` and matches package metadata.
- Application and migration images are immutable `linux/amd64` artifacts.
- Plan creates a named, unexecuted CloudFormation change set.
- Apply verifies the change set, SHA, and both image digests.
- Migration runs in private subnets without a public IP.
- A non-zero or missing migration exit code blocks service activation.
- Actions are pinned by commit SHA and control tests run in CI.

## Deferred work

- Provision and qualify the AWS resources and GitHub environment.
- Resolve first-deployment migration bootstrap resources through an approved
  foundation update; apply is update-only until that contract exists.
- Execute deployment, qualification, UAT, recovery exercise, and owner approval.
