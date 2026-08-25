# Release candidate 0.1.0-rc.2

## Candidate identity

| Field | Controlled value |
| --- | --- |
| Product | Trace Document Control QMS |
| Candidate | `0.1.0-rc.2` |
| Source | Prompt 022 final merge SHA |
| Runtime | Node.js 22, Next.js 16, PostgreSQL 17 |
| Artifact | Non-root standalone OCI image addressed by `sha256:` digest |

The final merge SHA and deployed image digest are recorded after review and may
not be replaced by a branch name or mutable image tag. The application liveness
response exposes the configured candidate version and full source SHA so the
qualification workflow can reconcile source, artifact, and deployment.

## Candidate change from rc.1

`rc.2` includes the protected validation-environment qualification controls
merged after `rc.1`. It adds machine-verifiable deployed release identity and an
AWS Fargate validation runtime contract. No successful automated check is a
substitute for the controlled UAT, recovery exercise, or human approval record.

## Release prerequisites

- Approved AWS account, region, validation hostname, and network design.
- PostgreSQL 17 validation database and provider backup/PITR controls.
- Immutable image built with `APP_RELEASE_VERSION=0.1.0-rc.2` and the final full
  merge SHA, then deployed by digest.
- GitHub `validation` environment with required reviewers, self-review
  prevention, branch/tag restrictions, and scoped variables/secrets.
- Named quality, security, and service owners.
- Synthetic-data confirmation and approved RPO/RTO targets.

## Required evidence

- Final CI and Security workflow URLs.
- Release tag, full source SHA, image URI and digest, and ECS task revision.
- Migration, liveness, readiness, authentication-boundary, and qualification
  outputs.
- Completed environment configuration, UAT, recovery, deviations, residual-risk
  assessment, and three-owner release decision.
