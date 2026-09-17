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

## Equipment overdue monitor

The application exposes a protected `POST /api/internal/equipment-overdue`
endpoint. The Equipment workspace immediately marks ACTIVE equipment unusable
when a required calibration or maintenance date is overdue, but the formal
`EquipmentComplianceHold` record is created by this monitor.

For the Railway development preview, configure a separate Railway cron service
from the same GitHub repository. Do not run the cron inside the long-running web
service.

1. Create a new Railway service from `Trace-Scientific/trace-document-control-qms`
   on branch `main` and name it `equipment-overdue-monitor`.
2. Set its Start Command to `node scripts/run-equipment-overdue.mjs`.
3. Set its Cron Schedule to `*/15 * * * *` (every 15 minutes, UTC).
4. Set Restart Policy to `Never` so each scheduled run exits after one monitor
   request.
5. Configure `APP_BASE_URL` with the HTTPS URL of the `qms-preview` web service.
6. Configure `CRON_SECRET` with the same secret used by the application service.
   Use Railway service variables; never commit the value.
7. Do not attach a public domain to the cron service and do not configure a
   health check for it.
8. After deployment, use Railway's one-time service execution/redeploy controls
   to verify the runner exits successfully and logs the monitor response before
   relying on the schedule.

The runner fails closed if `APP_BASE_URL` is absent, if `CRON_SECRET` is missing
or shorter than 32 characters, or if the protected endpoint returns a non-2xx
response. Railway cron jobs must terminate after the task completes; a run that
remains active can cause subsequent scheduled executions to be skipped.

## Twilio delivery-status monitor

PR 23 adds the application-side scheduler contract for bounded Twilio delivery-status
polling. PR 24 adds the one-shot Railway runner and preview activation procedure.
Use the dedicated [Twilio preview scheduler activation runbook](twilio-preview-scheduler-runbook.md)
for the reviewed service name, command, 15-minute cadence, one-time execution check,
and the rule that `PLATFORM_SCHEDULER_CONFIGURED=true` is set only after a successful
preview scheduler run.

Do not add Twilio provider credentials to the Railway cron service. The runner calls
the machine-authenticated application endpoint only; provider credential resolution
stays inside the governed application boundary. Twilio polling remains observation
and reconciliation evidence only and never authorizes an automatic resend.

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
