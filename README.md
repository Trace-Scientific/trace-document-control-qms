# Trace Document Control QMS

Foundation repository for a laboratory Quality Management System (QMS) for Orange County Labs.

## Prompt 002 foundation

This branch establishes the application and database foundation:

- Next.js / React / TypeScript application
- PostgreSQL + Prisma data layer
- validated environment configuration
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
