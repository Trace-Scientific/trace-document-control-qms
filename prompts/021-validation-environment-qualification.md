# Prompt 021 — Validation environment qualification

## Objective

Make validation-environment qualification repeatable while keeping production
approval dependent on controlled human evidence and segregation of duties.

## Delivered scope

- Manual, environment-protected GitHub Actions qualification workflow.
- Exact deployed-SHA checkout and identity verification.
- Secret-safe liveness, readiness, authentication-boundary, authenticated read,
  and overdue-monitor smoke checks.
- Ninety-day non-secret automated evidence artifact.
- Critical-workflow UAT protocol covering lifecycle, reviews, signature,
  effective state, templates, transfers, acknowledgments, idempotency, tenant
  isolation, and audit chronology.
- Recovery-exercise, environment-configuration, and release-approval records.

## External prerequisites

- Approved validation hosting and HTTPS URL.
- GitHub `validation` environment with required reviewers.
- Environment variable `VALIDATION_BASE_URL`.
- Scoped secrets `VALIDATION_SESSION_TOKEN` and `CRON_SECRET`.
- Named quality, security, and service owners.

## Acceptance checks

- CI and Security workflows pass on the final head.
- Validation-smoke configuration tests reject plaintext URLs and missing/weak
  credentials.
- The qualification workflow cannot execute without the protected environment
  and required inputs.
- No source-controlled file or evidence artifact contains credential values.
