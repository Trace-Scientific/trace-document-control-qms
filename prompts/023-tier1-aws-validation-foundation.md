# Prompt 023 — Tier 1 AWS validation foundation

## Objective

Convert the approved deployment decisions into a reviewable, secret-free AWS
foundation for the Trace QMS validation environment.

## Delivered scope

- Primary region fixed operationally to `us-west-1`.
- Two-AZ public, application, and isolated database network layout.
- Independent per-zone NAT paths for application-task egress.
- Encrypted PostgreSQL 17 RDS Multi-AZ with managed bootstrap credentials,
  deletion protection, 35-day backups, PITR capability, logs, and performance
  monitoring.
- Immutable, encrypted, scan-on-push ECR repository.
- Infrastructure tests for availability, deletion, encryption, and secret-safety
  controls.
- Tier 1 decision record, regional-disaster limitation, apex-domain control, and
  temporary segregation-of-duties risk.

## External prerequisites

- AWS account access and approved infrastructure deployment identity.
- Route 53 hosted zone or delegated DNS control for `traceqms.com`.
- ACM certificate in `us-west-1`.
- Least-privilege application database role and separately managed runtime
  `DATABASE_URL` secret created after the database foundation is available.
- Approved secondary region or formally narrowed regional-disaster objective.
- Independent production-release reviewer.

## Acceptance checks

- CI and Security pass on the final head.
- The template contains no account IDs, password values, or connection strings.
- RDS is private, encrypted, Multi-AZ, deletion-protected, and retained by
  snapshot on replacement or stack deletion.
- ECR rejects mutable image tags and scans pushed images.
- The stack is not deployed until an AWS change record, cost review, and region
  check are approved.
