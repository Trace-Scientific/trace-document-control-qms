# Prompt 018 — Production readiness and operational validation

## Objective

Create a repeatable, evidence-producing deployment and incident-response path
for the Document Control QMS.

## Delivered scope

- Strict PostgreSQL and scheduler-secret environment validation.
- Separate no-cache liveness and database-backed readiness endpoints.
- Readiness logic that does not expose dependency errors or connection details.
- Production CI smoke checks against the built server, including dependency
  readiness and authentication-boundary verification.
- Production deployment, verification, rollback, and release-acceptance runbook.
- Incident severity, containment, diagnosis, recovery, and closure runbook.

## Acceptance checks

- TypeScript, ESLint, all tests, Prisma validation/integrity, and production build
  pass.
- The built server returns `200` for liveness and readiness with a healthy test
  database.
- An unauthenticated protected endpoint returns `401`.
- Readiness returns `503` without leaking internal dependency errors when a check
  fails.
