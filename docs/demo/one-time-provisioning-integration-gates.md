# Restricted demo provisioning: verified CI evidence and approval gates

**Review-only. No Railway or production execution is authorized by this document, CI success, or PR merge.**

## Verified automated evidence

- Commit `d98646aaf85e263981c6f0d8eb92dd62fac09ed3`: GitHub commit workflow results show **success** for `CI`, `Security`, `Demo SQL migration-faithful integration`, and `Demo SQL disposable concurrency verification`.
- Migration-faithful workflow applies the repository's actual Prisma migrations to isolated PostgreSQL **17.11** and runs two integration tests: one inactive synthetic tenant plus linked audit and duplicate rejection; simulated audit failure must roll back tenant creation.
- Disposable concurrency workflow uses PostgreSQL 18 in a Docker container with `--network none`. It checks a restricted NOLOGIN owner, role membership and attributes, function ownership, `SECURITY DEFINER`, restricted `search_path`, PUBLIC ACLs, executor direct DML denial, explicit test-only EXECUTE, two independent concurrent calls with exact duplicate rejection, one inactive organization, one linked audit, and EXECUTE revocation.
- The SQL install rejects a pre-existing `demo_one_time` schema, avoids `CREATE OR REPLACE`, and revokes PUBLIC function execution in the same transaction.
- These tests use **disposable databases**, not Railway. No live tenant was created.

## Limitations requiring independent review

1. No submitted GitHub PR review was recorded when this document was prepared. A qualified reviewer must inspect the exact SQL, workflows, test harness, and actual effective privileges, including schema/table grants, role inheritance, ownership, default privileges, and EXECUTE access.
2. The migrated-schema tests use the isolated test database administrator. The restricted-role test uses stand-in tables. Together they do **not** prove that the proposed roles have sufficient and only necessary privileges on the full migrated schema.
3. Retain the exact GitHub Actions run URLs/logs, PostgreSQL versions, and commit SHA in the release approval record. A green workflow is evidence for its configured assertions, not a comprehensive security certification.
4. Confirm that the application never automatically installs or invokes the review-only SQL and that no production/demo deployment hooks expose this routine.

## Release decision

**PR #421 remains draft pending independent security approval.** After documented review, merge may be considered separately. A merge must not install or execute the routine on Railway.

## Separate future demo-only live authorization

Before any Railway demo database write: independently verify demo project/environment/database identity, obtain and verify a fresh backup, confirm absence of the target `loginCode`, inventory effective owner/executor privileges, and obtain explicit authorization for the exact one-time operation. Never execute against production.
