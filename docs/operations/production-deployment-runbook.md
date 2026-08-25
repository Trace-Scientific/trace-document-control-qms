# Production deployment runbook

## Required configuration

Provision the application and PostgreSQL database in the same protected network.
Store all credentials in the hosting provider's secret manager.

| Setting | Requirement |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection with TLS and a least-privilege application role |
| `APP_BASE_URL` | Deployed HTTPS origin, with no trailing path |
| `CRON_SECRET` | At least 32 random characters; identical in the app and GitHub Actions |
| Repository variable `QMS_BASE_URL` | Same deployed HTTPS origin used by the overdue monitor |

Never place production values in `.env` files, workflow source, support tickets,
or logs.

## Pre-deployment gate

1. Require a reviewed pull request with green CI.
2. Confirm the release commit and approved change record match.
3. Snapshot the database and verify restoration according to the provider's
   recovery procedure.
4. Run `npx prisma migrate status` against the target database.
5. Verify secrets, TLS, allowed origins, and the scheduler variable.

## Deployment

1. Deploy the immutable artifact for the approved commit.
2. Run `npx prisma migrate deploy` once from the protected release job.
3. Wait for `GET /api/health` to return `200`.
4. Require `GET /api/health/readiness` to return `200` and report the database
   check as `ok` before routing traffic.
5. Exercise an unauthenticated protected API request and verify it returns `401`.
6. Run the `Overdue review monitor` workflow manually and verify a successful
   response.
7. Record the commit, migration result, operator, timestamps, and smoke evidence
   in the deployment record.

## Rollback

Application releases are rolled back by routing traffic to the prior immutable
artifact. Database migrations are forward-only: do not run ad hoc down scripts.
If a migration causes an incident, stop writes, preserve evidence, restore the
validated snapshot to an isolated instance, and follow an approved corrective
migration or disaster-recovery procedure.

## Release acceptance

- Liveness and readiness remain healthy for 15 minutes.
- Authentication failures remain generic and no secrets appear in logs.
- Notification outbox failures and overdue-monitor runs are visible to the
  operations owner.
- A controlled-document draft, review assignment, and audit event can be created
  in the validated production tenant using an authorized test account.
