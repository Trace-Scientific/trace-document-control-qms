# Trace QMS — Customer demo security acceptance matrix

**Status:** Evidence collection plan, not a certification or test pass. Use only isolated, authorized synthetic tenants and approved test credentials. This matrix does not authorize creating tenants, granting permissions, or restoring databases.

## Evidence rules

For each case record exact commit SHA, environment identity, synthetic tenant IDs (not credentials), test command or UI procedure, UTC timestamp, sanitized result, evidence link, reviewer, and disposition. A GitHub CI success on a different commit or environment does not establish live Railway demo isolation. A production Railway deployment does not establish the separate demo deployment.

| ID | Requirement / attack boundary | Required acceptance evidence | Status |
| --- | --- | --- | --- |
| ISO-01 | Tenant A user cannot read Tenant B controlled documents by guessed ID or query | Authenticated negative API test for both A→B and B→A, including status and sanitized audit evidence | Not verified for live demo |
| ISO-02 | Tenant A user cannot mutate Tenant B drafts, reviews, signatures, or effective status | Negative command tests in both directions, followed by read-only verification that B state and audit trail were unchanged | Not verified for live demo |
| ISO-03 | Reviewer and final approver have distinct effective permissions | Authorized technical review, authorized final approval; unauthorized reviewer and cross-tenant requests denied; final approver UI excludes reviewer-only actions | Manual happy path observed; negative live-demo tests outstanding |
| ISO-04 | Provisioning rejects wrong environment, database, collision, and replay | Read-only preflight and approved isolated test evidence; no production data or role changes | Repository guards exist; live acceptance outstanding |
| ISO-05 | Synthetic demo users cannot reach platform administrator or another organization's data | Role-based UI/API negative checks for each demo persona; support access only through separately governed process | Not verified for live demo |
| ISO-06 | External demo contains no PHI or real customer records | Data-classification review of users, documents, attachments, notifications, audit metadata, and exports | Not verified |
| REC-01 | Backup is usable and restore is isolated | Timestamped backup, checksum, isolated restore transcript, post-restore checks and named reviewer | Prior isolated restore reported in provisioning contract; current target evidence requires revalidation |
| REC-02 | Demo reset cannot affect production | Independently verified environment/database identity and approved rollback/restore test | Not verified |
| OPS-01 | External access is approved | Signed product/security go/no-go decision, credential distribution process, expiry/revocation and incident contact | Not approved |

## Existing repository evidence to inspect (not automatically accepted as live-demo results)

- `src/lib/security/authorization.test.ts` — authorization tests.
- `src/lib/documents/service.test.ts` and `src/lib/reviews/service.test.ts` — document and review service tests.
- `src/lib/signatures/service.test.ts` — signature service tests.
- `src/lib/documents/demo-fixture-postgres.integration.test.ts` — demo fixture database integration coverage.
- `docs/architecture/support-tenant-isolation-gate.md` — support-access isolation controls.
- `docs/demo/one-time-provisioning-verified-contract-2026-11-07.md` — historical provisioning/restore evidence; check target and currency.
- `docs/demo/operator-reset-recovery-runbook.md` — controlled recovery procedure.

## Verified Railway demo evidence — November 17, 2026

**Source:** Read-only Railway environment inventory, service configuration, and deployment/runtime logs. This is an evidence snapshot, not approval for external access.

- Railway project `e6cc5f1e-3064-46d3-90bf-c763334f01a8`, separate `demo` environment `3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4`: six services reported healthy, no current issues. Demo app and preflight were successfully deployed from `e66d7516a26470340e37f7ec024b9616f06efb89`.
- Backup service `trace-qms-demo-s3-backup` has cron schedule `0 9 * * *` (Railway schedule). Runtime logs show a November 17 backup uploaded at approximately 09:04:56 UTC to the private S3 backup bucket, with AES256 encryption reported. The upload log explicitly says an isolated restore is still required before recovery is verified for that backup.
- Restore-validation service `trace-qms-demo-restore-validation` logged a November 14 checksum verification `OK`, a restore into disposable local-only PostgreSQL 18, and `PASS: isolated restore completed; application tables: 204`. The log explicitly says no running Railway database was contacted or modified.
- **Evidence boundary:** The November 14 successful restore used a November 13 backup, **not** the November 17 backup. Thus REC-01 has historical isolated-restore evidence, but no verified isolated restore of the latest backup. REC-02 and live tenant-isolation and synthetic-data checks remain open.
- No database writes, provisioning changes, permission changes, or restore execution were performed while collecting this evidence.

## Execution sequence

1. Identify and attest the **separate** Railway demo project/environment/service/database. Stop if access or identity cannot be verified.
2. Inventory existing automated negative tests and map exact test names to ISO-01 through ISO-05. Add missing isolated test coverage via PR, never by experimenting with customer data.
3. Run tests against a dedicated disposable synthetic test database under CI or a separately approved isolated environment; record both directionality and unchanged-state assertions.
4. Verify current backup and isolated restore evidence without altering the live demo database.
5. Conduct a read-only synthetic-data inventory, then a separately approved demo smoke test with fictional users.
6. Record owner approvals for any external access; do not infer approval from merged PRs.

## Go/no-go

**NO-GO** if any cross-tenant access succeeds, environment identity is ambiguous, data classification is unknown, recovery evidence is missing, or access authorization is absent. Only mark a row passed with reproducible, target-specific evidence reviewed by the designated owner.
