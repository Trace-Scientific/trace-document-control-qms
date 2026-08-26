# Prompt 029 — Low-cost development preview environment

## Objective

Provide a low-cost, shared Railway preview for viewing and fine-tuning the QMS
without representing it as validated or creating the Tier 1 AWS foundation.

## Delivered scope

- Define one Railway application replica and one PostgreSQL service using the
  current TypeScript infrastructure-as-code format.
- Deploy only merged `main`, apply committed Prisma migrations before startup,
  and use database-backed readiness checks.
- Preserve secrets in the hosting platform and commit no credentials.
- Display an unambiguous development-preview warning in the application.
- Document cost, access, synthetic-data, promotion, and shutdown guardrails.
- Add an automated contract test for the preview configuration.

## External prerequisites

- Trace Scientific-owned Railway workspace with MFA, billing limit, and alerts.
- GitHub authorization for the repository.
- Platform-generated `CRON_SECRET` and assigned `APP_BASE_URL`.
- Human review of the Railway infrastructure plan before applying it.

## Deployment boundary

This source change does not create a Railway account, project, database, domain,
or charge. The preview is not a validation or production environment and may
contain synthetic data only.
