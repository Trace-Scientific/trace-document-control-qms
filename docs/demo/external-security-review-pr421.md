# External security review brief — PR #421

**Status:** Review package; not an approval or authorization to deploy.
**Repository:** Trace-Scientific/trace-document-control-qms
**PR:** https://github.com/Trace-Scientific/trace-document-control-qms/pull/421
**Scope:** One-time inactive synthetic demo tenant provisioning via PostgreSQL SECURITY DEFINER.

## Objective and requested deliverables

Commission a qualified independent PostgreSQL/application security reviewer to evaluate the proposed routine and deployment boundary. Request (1) a written finding for each issue with severity, affected file/line, exploitability, and mitigation; (2) a signed or attributable GitHub PR review explicitly stating **approve**, **changes requested**, or **not approved**; (3) a concise residual-risk statement and exact commit SHA reviewed. Reviewer must not execute against Railway or request secrets.

## Key source and evidence

- `sql/demo-one-time-create-inactive.sql`: review-only transaction; fail-closed schema creation; fixed parameterless SECURITY DEFINER routine; explicit `search_path`; fixed advisory lock; target loginCode guard; one inactive Organization and one linked AuditEvent; PUBLIC EXECUTE revoked before commit; no live GRANT.
- `scripts/demo-one-time-concurrency.disposable.sh`: PostgreSQL 18 Docker disposable test, no network; restricted NOLOGIN owner, temporary executor, ACL checks, concurrent calls, expected duplicate error, rollback, cleanup.
- `scripts/demo-one-time-sql.integration.node-test.mjs` and `scripts/demo-one-time-sql-failure.integration.node-test.mjs`: rollback-safe integration tests.
- `.github/workflows/demo-one-time-migrated-schema.yml`: actual Prisma migrations and PostgreSQL 17 integration.
- `.github/workflows/demo-one-time-concurrency.yml`: disposable concurrency checks.
- `docs/demo/one-time-provisioning-integration-gates.md`: evidence and explicit limitations.

## Required independent review checklist

1. **SECURITY DEFINER threat model:** function owner is NOLOGIN, non-superuser, no BYPASSRLS or unexpected memberships; fixed search_path and schema-qualified references prevent object hijacking; owner has only necessary grants; consider RLS and triggers on real schema.
2. **Privilege inventory:** review effective EXECUTE access, schema USAGE/CREATE, public schema trust, table grants, role inheritance, default privileges, ownership, and any permissions granted indirectly through other roles.
3. **Transaction correctness:** creation/audit atomicity, exception rollback, uniqueness, concurrent callers, advisory lock behavior, unexpected failures, repeated install attempts, and side effects of triggers.
4. **Deployment separation:** review-only SQL cannot be auto-installed/executed by migrations, CI, app startup, or release scripts. Merge is not live execution authorization.
5. **Evidence:** confirm workflow runs, commit SHA, Postgres versions, and test isolation; distinguish migrated-schema admin tests from restricted-role stand-in tests.
6. **Operational safety:** verify the intended demo-only project/environment/database and fresh backup/restore evidence *before* any separately authorized future live write. Never inspect live secrets or customer data as part of this review.

## Known gaps to resolve

- No independent GitHub approval is recorded.
- No migrated-schema test currently exercises the exact proposed restricted production-like owner/executor grants.
- Live Railway effective privilege inventory, fresh backup, identity verification, and target-absence preflight are separate future gates, not evidence provided here.

## Reviewer access and boundaries

Provide **read-only repository/PR access** and CI logs; redact credentials and customer information. Do not share Railway/AWS/GitHub tokens, connection strings containing passwords, or production data. Use an isolated throwaway PostgreSQL environment for reproduction. No live DDL/DML, no merge, and no production/demo deployment are authorized by this engagement.

## Acceptance criteria

- Independent reviewer submits attributable written findings and a GitHub PR review.
- Any critical/high issues are fixed and retested; reviewer approves the final commit.
- Evidence links, version and SHA are retained; project owner explicitly authorizes merge separately.
- Any subsequent demo-only Railway provisioning requires a new, specific authorization and its own verified backup/identity/privilege checks.

## Suggested outreach scope

Seek a PostgreSQL specialist with SECURITY DEFINER and least-privilege auditing experience, plus familiarity with Node/Prisma and GitHub Actions. Request a fixed-scope review of this PR rather than a full-platform penetration test. Ask for an estimate and availability before granting access.
