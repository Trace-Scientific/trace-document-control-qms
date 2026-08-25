# Trace Document Control QMS

Foundation repository for a laboratory Quality Management System (QMS) for Orange County Labs.

## Prompt 002 foundation

This branch establishes the application and database foundation:

- Next.js / React / TypeScript application
- PostgreSQL + Prisma data layer
- validated environment configuration
- scheduler-ready overdue review monitoring

## Overdue review monitor

Configure `CRON_SECRET` with at least 32 random characters. Schedule an HTTPS
`POST` to `/api/internal/review-overdue` with the header
`Authorization: Bearer <CRON_SECRET>`. The endpoint finds overdue active review
stages across organizations and creates idempotent outbox notifications and
audit events. It returns `404` when the secret is absent, weak, or incorrect.

The `Overdue review monitor` GitHub Actions workflow runs hourly at minute 17.
Configure the repository variable `QMS_BASE_URL` with the deployed HTTPS origin
and the Actions secret `CRON_SECRET` with the same application secret. The
workflow fails closed when either value is missing and can also be run manually.

Production releases must follow the
[deployment runbook](docs/operations/production-deployment-runbook.md). Security,
availability, or integrity events follow the
[incident-response runbook](docs/operations/incident-response-runbook.md).

Container hosting, alert ownership, backup exercises, and release approval are
defined in the [observability and recovery controls](docs/operations/observability-and-recovery.md)
and [release-candidate checklist](docs/operations/release-candidate-checklist.md).

The current candidate is [`0.1.0-rc.2`](docs/validation/release-candidate-0.1.0-rc.2.md).
Its implemented critical controls are linked to automated and external evidence
in the [validation traceability matrix](docs/validation/traceability-matrix.md).

Validation deployment uses the protected `Validation environment qualification`
workflow and the [critical-workflow UAT protocol](docs/validation/critical-workflow-uat-protocol.md).
Executed evidence and approvals belong in the controlled validation record, not
in source control.

The approved AWS validation foundation and Tier 1 recovery decision are recorded
in [`deploy/aws/validation`](deploy/aws/validation) and the
[`Tier 1 recovery architecture`](docs/validation/tier-1-recovery-architecture.md).
The service-layer deployment gates are listed in the
[`AWS validation service preflight`](docs/operations/aws-validation-service-preflight.md).
- health endpoint
- automated unit-test configuration
- ESLint and strict TypeScript
- Docker Compose PostgreSQL development service
- GitHub Actions CI
- initial organization/site/department/user/role/permission/audit schema

## Current status

The foundation is intentionally not the complete QMS. Document Control, electronic signatures, records, personnel, training, competency, quality events, CAPA, equipment, validation, PT, audits, inspection readiness, reporting, integrations, and AI are subsequent modules.

## Regulatory posture

This software is not represented as certified or compliant with CAP, CLIA, HIPAA, ISO 15189, 21 CFR Part 11, or any other regulatory/accreditation framework merely because technical features exist. Formal requirements mapping, security controls, validation, laboratory procedures, and implementation review are required before production use.

## Development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d`.
3. Install dependencies with `npm install`.
4. Generate Prisma client with `npm run db:generate`.
5. Apply the database migration using the project's Prisma migration workflow.
6. Run `npm run dev`.

Never use production PHI/PII as development fixtures.
