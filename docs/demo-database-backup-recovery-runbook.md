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
4. Require explicit log evidence: `PASS: archive checksum verified`, `PASS: isolated restore completed`, and an application table count greater than zero.
5. Never point the restore worker at the running demo or production database. Never restore into an existing database without a separately reviewed recovery plan.
6. For complete disaster recovery readiness, additionally validate application startup, migrations compatibility, access controls, file/object storage dependencies, and end-user workflows in an isolated environment.

## Application startup check in CI

GitHub Actions dumps and restores its disposable PostgreSQL fixture, runs Prisma migrations and database integrity checks against the restored copy, then starts the built Trace QMS app using that copy. The smoke test checks database-backed readiness and verifies that an unauthenticated document request receives HTTP 401.

CI also builds the Railway restore worker and runs it against the disposable archive with external networking disabled. The archive and checksum are read from a local fixture in CI.

On Railway the worker reads the selected archive and checksum from private demo S3, restores to disposable PostgreSQL, and starts the app against that copy. Both processes listen only on loopback. The app starts with an explicit local database URL in a fresh environment. An optional private-file drill supplies only dummy credentials for the disposable loopback object endpoint. Require the `PASS: Trace QMS started against the restored database` line in addition to the checksum and table-count messages. The startup drill also tests authenticated document recovery when the validator has a sealed, temporary `RESTORE_DEMO_PASSWORD` for the existing Alex Morgan account in `trace-demo-lab`. The password must match the selected archive. The probe uses the ordinary login route and requires a new session before reading `TEST-001`. Require the authenticated `PASS` log line and remove the temporary variable after the drill. A run that logs `SKIP` establishes startup coverage only. GitHub Actions generates its own fixture password and seeds the synthetic document before creating its disposable backup.

CI also tests recovery of one synthetic private file. It restores the file metadata with the PostgreSQL archive and loads the separately supplied file bytes into a disposable loopback object-store fixture. The ordinary private-file endpoint must return HTTP 401 before sign-in, return the expected bytes after sign-in, and return HTTP 409 when the stored bytes no longer match the restored SHA-256. The worker runs with external networking disabled for this check.

## Single-file Railway demo recovery drill

1. Select an available synthetic file from `trace-demo-lab` and record its file UUID. Export its original bytes through the ordinary authenticated Trace QMS download. Select a demo database archive created after the file became available and use the demo credential that matches that archive.
2. Store the exported bytes in the private demo backup bucket at `demo/private-files/<RESTORE_BACKUP_NAME>/<file UUID>`. Use a writer scoped to the selected demo key and give the validator read-only access to that key in addition to its existing archive access. Keep the database archive and file copy under the same recovery record.
3. Set `RESTORE_PRIVATE_FILE_ID` and the sealed temporary `RESTORE_DEMO_PASSWORD` on the demo restore validator. Keep `RESTORE_BACKUP_NAME` pinned to the paired archive and start the validator.
4. The validator serves the backed-up bytes from a disposable loopback endpoint. It locates the file key in the restored tenant's database and uses the ordinary authenticated file download to check access and SHA-256. Require HTTP 401 before sign-in, HTTP 200 for the recovered file, and HTTP 409 when the loopback endpoint serves different bytes. Require `PASS: restored private file download, SHA-256, and denial checks` in the deployment log. The corruption check changes only the disposable server's response.
5. Record the archive, file UUID, deployment ID, verification result, and reviewer. Remove the temporary password and file UUID from the validator after the drill.

This drill verifies one separately backed-up demo object. A scheduled private-file backup and full-bucket recovery need separate evidence.

## Paired private-file recovery drill

1. Verify that the demo validator deployment contains the reviewed restore code and that CI passed the disposable two-file restore and denial checks.
2. Save the validator's baseline archive setting. Select the paired archive with `RESTORE_BACKUP_NAME`, enable `RESTORE_PRIVATE_FILES_ALL=1`, and supply a temporary sealed `RESTORE_DEMO_PASSWORD` matching the selected archive. Leave `RESTORE_PRIVATE_FILE_ID` unset.
3. The validator checks the archive checksum, restores disposable PostgreSQL, reconciles the completed manifest with the restored `trace-demo-lab` inventory of AVAILABLE private files, and verifies file sizes and hashes. It reads only the reconciled UUIDs and serves the checked copies over loopback.
4. Verify the file count against the paired backup. Require the manifest reconciliation and authenticated recovery log lines with the same count, the `TEST-001` lookup, and the readiness result. The authenticated recovery line covers anonymous denial, a matching authenticated download, and corrupted-byte denial for each selected file.
5. Remove the temporary password and multi-file flag, restore the baseline archive setting, and verify the cleanup deployment and variable inventory. Record the selected archive, commit, deployment IDs, UTC timestamps, file count, checks and independent reviewer decision.

The paired drill covers only the eligible files in the selected synthetic tenant and archive. Scheduled executions and full-bucket recovery require separate evidence.

## Verified restore on November 23, 2026

- **Archive:** `demo/postgres/trace-qms-demo-20261123T090224Z.backup` and matching `.sha256` in the private demo bucket.
- **Checksum:** SHA-256 verification returned `OK` at 3:12:21 PM Pacific.
- **Outcome:** Disposable, local-only PostgreSQL 18 restored **216 application tables** at 3:12:23 PM Pacific. The validator reported zero contact with running Railway databases.
- **Evidence:** [Railway restore-validation deployment `703ed20b-2a77-4c79-9a54-58c6cc94f7fb`](https://railway.com/project/e6cc5f1e-3064-46d3-90bf-c763334f01a8/service/911b9c57-532d-48bd-972c-8cec81fc2bd9?environmentId=3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4&id=703ed20b-2a77-4c79-9a54-58c6cc94f7fb) reached `SUCCESS`.
- **Application startup:** A [second Railway run](https://railway.com/project/e6cc5f1e-3064-46d3-90bf-c763334f01a8/service/911b9c57-532d-48bd-972c-8cec81fc2bd9?environmentId=3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4&id=e666c9f3-c792-4bb5-82ac-056362805952) restored the same archive at 3:57 PM Pacific, started Trace QMS on loopback, and verified database readiness and HTTP 401 for an unauthenticated document request.
- **Authenticated document recovery:** A [third Railway run](https://railway.com/project/e6cc5f1e-3064-46d3-90bf-c763334f01a8/service/911b9c57-532d-48bd-972c-8cec81fc2bd9?environmentId=3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4&id=25a60d13-1f7e-46e8-a88d-a99c235d8b08) reached `SUCCESS` on commit `14f6fc8e2192c024516baa0c0544bd4d6712808b`. It verified the same archive checksum, restored 216 application tables into disposable PostgreSQL 18, and started Trace QMS on loopback. At 4:36:59 PM Pacific on November 23 (00:36:59 UTC on November 24), the ordinary demo sign-in established a new session for the synthetic `trace-demo-lab` account and retrieved restored document `TEST-001`. The same run verified database readiness and HTTP 401 for an unauthenticated document request.
- **Acceptance:** Independent reviewer acceptance and private-file recovery remain open.

## Live single-file recovery — November 23, 2026 Pacific

- Demo environment `3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4`, synthetic tenant `trace-demo-lab`; commit `b2185fb7c58199ac40bfc952a2d323666456b74c` (PR #621).
- Archive `trace-qms-demo-20261124T015518Z.backup`; original authenticated export `Trace_QMS_Demo_Scan_Status_PR613.txt`, UUID `fc269887-cb47-4784-826a-a70dddf48ce8`. Operator screenshot evidence shows Available status and successful 237-byte S3 upload to the paired archive prefix; validator retrieved the selected object.
- [Railway deployment 6253d997-fa5c-4e4d-bb34-3b4965aff7e9](https://railway.com/project/e6cc5f1e-3064-46d3-90bf-c763334f01a8/service/911b9c57-532d-48bd-972c-8cec81fc2bd9?environmentId=3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4&id=6253d997-fa5c-4e4d-bb34-3b4965aff7e9) reached SUCCESS. Archive checksum OK at 02:26:38 UTC November 24; 216 tables restored at 02:26:43 UTC; no running Railway database contacted or modified.
- At 02:26:45 UTC November 24 (6:26:45 PM Pacific November 23), logs reported `PASS: authenticated demo login and restored TEST-001 document lookup` and `PASS: restored private file download, SHA-256, and denial checks`. The latter is the runbook's aggregate assertion for anonymous HTTP 401, authenticated HTTP 200 with matching SHA-256, and corrupted-byte HTTP 409; individual file status codes were not separately printed. Readiness and anonymous document HTTP 401 also passed.
- Operator removed both temporary variables; Railway variable inventory confirmed absence of RESTORE_DEMO_PASSWORD and RESTORE_PRIVATE_FILE_ID with RESTORE_BACKUP_NAME retained. Cleanup deployment `fc83c6f6-edd1-4e07-a432-bd59815daaa5` was building at verification.
- Technical disposition: PASS for one synthetic private file. Operator: James Ramsey. Independent reviewer: not yet designated/accepted. Full-bucket recovery, scheduled private-file backup, REC-02 and OPS-01 remain open; no prospect access authorized.

## Proposed retention (NOT YET CONFIGURED)

For this synthetic-only demo database, recommend 30 days of retained daily backups. AWS S3 versioning should remain enabled. Before configuring an S3 Lifecycle rule, explicitly review how current and noncurrent versions, delete markers, and incomplete multipart uploads will be treated. Confirm retention requirements with the owner and preserve any backups under investigation or legal hold. Never apply this demo rule to production buckets.

## Security and operations

- S3 Block Public Access remains enabled; SSE-S3 encryption and HTTPS-only bucket policy remain in place.
- Uploader IAM access should remain scoped to this bucket without delete permissions.
- Keep the backup worker's restart policy `NEVER`.
- Configure independent failure alerting and periodically perform isolated restore drills; a daily cron schedule alone does not send failure notifications.
- Record the date, selected S3 key, worker deployment ID, checksum result, restore outcome, and application table count after each drill.

## Live four-file recovery on November 24, 2026

- **Scope and input.** The demo restore validator used the retained archive `trace-qms-demo-20261124T192006Z.backup` and its paired manifest for the four AVAILABLE private files in synthetic tenant `trace-demo-lab`. The validator ran commit `73e2504683e8ecef90e2fb68d0909f89c6d1f10d` from PR #632. [Railway deployment `66bb2849-d26b-44fc-a151-61d8b5d2aeac`](https://railway.com/project/e6cc5f1e-3064-46d3-90bf-c763334f01a8/service/911b9c57-532d-48bd-972c-8cec81fc2bd9?environmentId=3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4&id=66bb2849-d26b-44fc-a151-61d8b5d2aeac) reached SUCCESS.
- **Database and manifest.** The archive SHA-256 passed at 20:19:36 UTC. Disposable, local-only PostgreSQL 18 restored 216 application tables at 20:19:38 UTC. At 20:19:43 UTC the validator reconciled the manifest exactly against the restored tenant inventory and verified the size and SHA-256 of all four stored files.
- **Application checks.** At 20:19:44 UTC, the restored application passed readiness, anonymous document access returned HTTP 401, and the synthetic demo account signed in and found `TEST-001`. Each private file returned HTTP 401 before sign-in, returned HTTP 200 with the expected size and SHA-256 after sign-in, and returned HTTP 409 when the loopback storage fixture served altered content. The validator logs report the aggregate file result. The application used disposable PostgreSQL and loopback object storage for the drill.
- **Cleanup.** Railway confirmed the validator no longer defines `RESTORE_DEMO_PASSWORD` or `RESTORE_PRIVATE_FILES_ALL`. The validator retained the verified archive for database-only checks. [Cleanup deployment `2d4744f3-b8ad-4501-ba8f-4c4f493adbdf`](https://railway.com/project/e6cc5f1e-3064-46d3-90bf-c763334f01a8/service/911b9c57-532d-48bd-972c-8cec81fc2bd9?environmentId=3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4&id=2d4744f3-b8ad-4501-ba8f-4c4f493adbdf) reached SUCCESS on the same commit. At 20:27:03 UTC the archive checksum passed. At 20:27:07 UTC disposable PostgreSQL restored 216 application tables. At 20:27:08 UTC app readiness and anonymous document denial passed. The authenticated check was skipped as expected.
- **Disposition.** Technical recovery passed for the four files in the selected archive. Validator cleanup is verified and independent reviewer acceptance is pending. Unattended scheduled execution, full-bucket recovery and REC-02 require separate evidence.

## Scheduled backup evidence on November 24, 2026

- The demo worker is configured for `0 9 * * *` (09:00 UTC). Railway lists a [09:04 UTC execution](https://railway.com/project/e6cc5f1e-3064-46d3-90bf-c763334f01a8/service/7c6f0d34-f772-4979-bc54-1da47b409bd6?environmentId=3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4&id=9b30046e-1073-485d-98a7-51524a0d4c5b&start=2026-11-24T09%3A04%3A46.964Z&end=2026-11-24T09%3A04%3A53.190Z&returnTo=cron-schedule) whose logs show publication of `trace-qms-demo-20261124T090447Z.backup` and its checksum. The execution history does not identify the trigger for this entry, and its logs contain no paired private-file publication result.
- The operator's 19:20 UTC manual run published the archive and checksum plus the manifest for four private files. Unattended paired publication remains open. Verify the next scheduler-triggered execution without using **Run now**, and retain the execution time, deployment ID, archive name, checksum upload evidence and paired manifest publication result.
