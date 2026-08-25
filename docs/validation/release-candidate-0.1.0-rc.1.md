# Release candidate 0.1.0-rc.1

## Candidate identity

| Field | Value |
| --- | --- |
| Product | Trace Document Control QMS |
| Candidate | `0.1.0-rc.1` |
| Source | Prompt 020 pull-request head; final SHA recorded after merge |
| Runtime | Node.js 22, Next.js 16, PostgreSQL 17 |
| Artifact | Non-root standalone OCI container |

## Automated evidence required

- Frozen `npm ci` installation from `package-lock.json`.
- High-severity dependency audit and CodeQL analysis.
- Prisma schema validation and forward migration from an empty PostgreSQL 17
  database.
- Database integrity suite against both the migrated source and an isolated
  logical-backup restoration.
- TypeScript, ESLint, complete unit/service suite, and production build.
- Production container build and built-server liveness, readiness, and
  authentication-boundary smoke checks.

## Certification status

This document identifies a release candidate, not a production release. A human
quality owner, security owner, and service owner must complete the controlled
release-candidate checklist and record objective evidence. Deployment secrets,
production recovery evidence, hosting approval, and validation-environment user
acceptance remain external release gates.

## Known residual items

- Confirm production hosting provider and protected network architecture.
- Configure `DATABASE_URL`, `APP_BASE_URL`, `CRON_SECRET`, and `QMS_BASE_URL` in
  their approved secret/variable stores.
- Complete a validation-environment recovery exercise and critical workflow UAT.
- Record formal quality, security, and service-owner approvals.
