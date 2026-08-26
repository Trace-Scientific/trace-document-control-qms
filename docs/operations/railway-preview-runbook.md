# Railway development preview runbook

This environment is for product review and interface fine-tuning only. It is
not a qualified validation or production environment and must contain synthetic
data only.

## Cost and access guardrails

- Use a Trace Scientific-owned Railway workspace with MFA enabled.
- Start on the Pro plan with a $50 monthly usage limit and billing alerts.
- Permit only accountable project collaborators to access the workspace.
- Keep one application replica and the smallest suitable PostgreSQL service.
- Use the generated Railway domain until a separate preview hostname is approved.
- Never use `traceqms.com` for this preview; that hostname remains reserved for
  the controlled environment.

## Initial setup

1. Create a Railway project from the GitHub repository and select `main`.
2. Use `.railway/railway.ts` as the desired project configuration. Review the
   Railway plan before applying it; it creates one application service and one
   PostgreSQL service.
3. Generate `CRON_SECRET` with at least 32 random characters in Railway. Do not
   commit or share its value.
4. Set `APP_BASE_URL` to the assigned HTTPS Railway domain.
5. Confirm `DEPLOYMENT_TIER` equals `development-preview`. The server renders
   the preview warning from this runtime value; no browser-exposed environment
   variable is required.
6. In the application service Build settings, set the Dockerfile path to
   `/Dockerfile.preview`. Do not change the repository `Dockerfile`, which is
   reserved for the protected AWS release path.
7. Apply the project configuration, then verify `/api/health/readiness` returns
   HTTP 200 and the application displays the development-preview banner.
8. Confirm the deployment log reports that all Prisma migrations were applied
   before the Next.js server started.
9. Configure the GitHub `QMS_BASE_URL` variable only if the overdue-review
   monitor should exercise this preview. Store the matching `CRON_SECRET` as a
   GitHub Actions secret.

The preview image applies committed Prisma migrations before starting Next.js.
Migration failure prevents the application from starting and from passing its
readiness check. Never run
development migration generation or schema reset commands against the preview.

## Review boundary

- Use invented organizations, people, documents, signatures, and identifiers.
- Do not enter PHI, PII, customer records, laboratory records, or controlled
  quality evidence.
- Preview approvals and electronic signatures have no regulated effect.
- Do not cite preview uptime, logs, backups, or testing as validation evidence.
- Export or delete synthetic data before any environment-purpose change.

## Promotion

Changes move through the normal feature-branch, CI, pull-request, and review
process. Railway auto-deploys only merged `main`. Formal qualification and
production release continue through the protected AWS workflows; the Railway
database is never promoted or copied into those environments.

## Shutdown

Before deleting the project, confirm that it contains synthetic data only and
that no required defect evidence exists solely in Railway. Remove the Railway
services and project through its dashboard, revoke the GitHub integration if no
longer needed, and confirm billing usage has stopped.
