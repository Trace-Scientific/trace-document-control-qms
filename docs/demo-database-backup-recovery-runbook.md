# Trace QMS demo database backup and recovery runbook

**Scope:** Isolated Railway `demo` environment only. This document does **not** authorize production database changes.

## Configuration and recovery evidence

- Railway project: `humorous-rejoicing` (`e6cc5f1e-3064-46d3-90bf-c763334f01a8`)
- Railway demo environment: `3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4`
- Demo PostgreSQL service: `Postgres-6QrB` (`7f2ad369-c21a-486a-8ac4-4a170b1674d3`)
- Demo backup service: `trace-qms-demo-s3-backup` (`7c6f0d34-f772-4979-bc54-1da47b409bd6`)
- Restore-validation service: `trace-qms-demo-restore-validation` (`911b9c57-532d-48bd-972c-8cec81fc2bd9`)
- Private AWS S3 bucket: `trace-qms-demo-db-backups`, region `us-east-2`
- S3 prefix: `demo/postgres/`
- Daily Railway cron: `0 9 * * *` (09:00 UTC; Pacific time varies with daylight saving time)
- Backup archive: PostgreSQL custom-format `.backup` plus corresponding `.backup.sha256`
- Credentials: Railway environment variables; never commit or print AWS secrets.

On October 30, 2026, the backup `trace-qms-demo-20261030T171011Z.backup` passed both local checksum validation and an isolated PostgreSQL 18 restore. Railway restore-validation logs reported **204 application tables**. This validates logical database restoration, not full application recovery.

## Daily verification

1. Inspect the latest `trace-qms-demo-s3-backup` deployment in Railway's **demo** environment.
2. Confirm it reports successful upload to `s3://trace-qms-demo-db-backups/demo/postgres/` and successful deployment status.
3. In AWS S3, confirm a new `.backup` and matching `.backup.sha256` exist for the scheduled date.
4. Investigate missing or failed runs immediately. A successful deployment alone is insufficient without confirming both S3 objects.

## Isolated restore validation

1. Select a specific backup and its matching checksum from the private S3 prefix.
2. Run the dedicated restore-validation service using the approved `RESTORE_BACKUP_NAME` (basename only).
3. The worker must download the two S3 objects, verify SHA-256, create a **disposable local-only** PostgreSQL 18 instance, restore with `--exit-on-error`, and check restored application tables.
4. Require explicit log evidence: `backup: OK`, `PASS: isolated restore completed`, and an application table count greater than zero.
5. Never point the restore worker at the running demo or production database. Never restore into an existing database without a separately reviewed recovery plan.
6. For complete disaster recovery readiness, additionally validate application startup, migrations compatibility, access controls, file/object storage dependencies, and end-user workflows in an isolated environment.

## Proposed retention (NOT YET CONFIGURED)

For this synthetic-only demo database, recommend 30 days of retained daily backups. AWS S3 versioning should remain enabled. Before configuring an S3 Lifecycle rule, explicitly review how current and noncurrent versions, delete markers, and incomplete multipart uploads will be treated. Confirm retention requirements with the owner and preserve any backups under investigation or legal hold. Never apply this demo rule to production buckets.

## Security and operations

- S3 Block Public Access remains enabled; SSE-S3 encryption and HTTPS-only bucket policy remain in place.
- Uploader IAM access should remain scoped to this bucket without delete permissions.
- Keep the backup worker's restart policy `NEVER`.
- Configure independent failure alerting and periodically perform isolated restore drills; a daily cron schedule alone does not send failure notifications.
- Record the date, selected S3 key, worker deployment ID, checksum result, restore outcome, and application table count after each drill.
