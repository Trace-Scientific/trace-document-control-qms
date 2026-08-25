# Prompt 019 — Hosting, observability, and release certification

## Objective

Produce a reproducible release artifact and objective evidence for security,
recoverability, operability, and controlled release approval.

## Delivered scope

- Non-root, health-checked multi-stage production container.
- Next.js standalone deployment output and minimal Docker build context.
- Structured, redacted operational telemetry for dependency failures.
- Logical PostgreSQL backup, isolated restore, and integrity verification in CI.
- CodeQL and high-severity dependency review workflows.
- Observability ownership and production recovery-exercise guidance.
- Evidence-oriented release-candidate certification checklist.

## Acceptance checks

- Existing CI gates pass.
- A production container builds from the approved source tree.
- A restored database passes the same integrity suite as the source database.
- CodeQL and dependency review report no blocking findings.
- Operational telemetry tests confirm redaction and non-scalar omission.
