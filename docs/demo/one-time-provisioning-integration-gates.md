# Restricted demo provisioning: integration evidence and remaining approval gates

**Review-only. Do not run against Railway or production.** This PR does not authorize installation, execution, or any live database write.

## Implemented in PR #421

- Fixed, parameterless SECURITY DEFINER routine inserts one inactive synthetic Organization and one linked AuditEvent in the same transaction.
- First-install-only SQL rejects a pre-existing `demo_one_time` schema and uses `CREATE FUNCTION`, not `CREATE OR REPLACE FUNCTION`.
- `REVOKE EXECUTE FROM PUBLIC` occurs in the same transaction as function creation.
- Dedicated GitHub Actions workflow `demo-one-time-concurrency.yml` invokes `RUN_DEMO_DISPOSABLE_CONCURRENCY=1` against a Docker PostgreSQL 18 container with `--network none`.
- Disposable test installs the routine as NOLOGIN `demo_owner`, verifies ownership, revokes temporary database CREATE privilege, checks the executor has no direct INSERT privilege, grants test-only EXECUTE, and runs two separate psql sessions. It checks one success, one failure, one inactive organization, one linked audit event, and post-test EXECUTE revocation.
- Separate opt-in scripts exist for duplicate and audit-failure rollback scenarios. **They are not automatically covered by the dedicated concurrency workflow.**

## Evidence limitations

- A green workflow proves only that its configured checks ran and passed at that commit. Inspect the exact run logs, commit SHA, and the final `PASS` line before signing off.
- The disposable concurrency test creates minimal stand-in tables, **not the complete migrated QMS schema**. It does not prove compatibility with actual audit triggers, default privileges, or all application migrations.
- The test's second session is expected to fail, but the current harness does not yet assert the exact duplicate-error message. A different error could satisfy its one-success/one-failure condition.
- The disposable test does not attest Railway identity or live permissions, and is not authorization for a live write.
- The owner has SELECT and INSERT on both stand-in tables. Review whether these rights can be narrowed further on the actual migrated schema.

## Remaining gates before merge or live provisioning

1. Run explicit audit-failure rollback and duplicate tests in separately reset disposable databases, and retain logs.
2. Run a migration-faithful isolated PostgreSQL integration test with actual Organization and AuditEvent definitions, triggers, and defaults.
3. Tighten the concurrent-session assertion to verify the expected duplicate rejection specifically, and retain per-session logs.
4. Independently inspect SECURITY DEFINER ownership, role membership, search_path, schema permissions, table grants, default privileges, and effective EXECUTE access.
5. Record PostgreSQL version, CI commit SHA, run URL, and test outcomes in review evidence.
6. For any future **demo-only** live operation: obtain a fresh verified backup, confirm Railway demo project/database identity, inspect target loginCode absence, and obtain separate explicit approval for the exact operation. Never treat PR merge or CI success as that approval.

**Decision:** Keep PR #421 in draft until these remaining review gates are resolved. Do not wire the function into an application or grant live EXECUTE.
