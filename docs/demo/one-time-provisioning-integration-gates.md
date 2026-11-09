# Restricted demo provisioning: remaining integration and privilege gates

**Do not execute against Railway.** PR #421 remains draft until these gates are independently reviewed.

## What the repository tests establish
- Static source checks cover a fixed, parameterless SECURITY DEFINER routine, locked search path, transaction lock, paired Organization/AuditEvent inserts, and public EXECUTE revocation.
- Opt-in local PostgreSQL tests are present for first creation, duplicate rejection, and simulated audit failure rollback.
- CI passing does **not** prove opt-in tests ran. Confirm explicit execution logs and successful assertions.

## Concurrency test still required (not yet implemented)
A correct concurrency test requires two independent database sessions against a **disposable database**, with the function already installed and committed, and a safe full-database reset afterward. A transaction wrapping both installation and execution in one session cannot prove cross-session locking. Do not write a test that silently skips or cleans up by deleting append-only audit records.

1. Create a fresh throwaway PostgreSQL 18 database/container with application migrations.
2. Attest localhost-only identity, database name, role, and container identity; never use Railway URLs.
3. Install the function under a deliberately restricted NOLOGIN owner; revoke PUBLIC EXECUTE in the same transaction.
4. Verify an unprivileged role cannot execute it. Grant EXECUTE to a dedicated test-only role.
5. Launch two independent sessions simultaneously. Assert exactly one succeeds, the other rejects duplicate, exactly one inactive organization and exactly one linked audit event exist.
6. Tear down the **entire throwaway database/container** after evidence capture. Never UPDATE/DELETE audit events to clean up.
7. Run audit failure rollback and second-attempt tests in separately reset throwaway instances.
8. Record test logs and Postgres version as CI artifacts.

## Blocking privilege concerns
- `CREATE SCHEMA IF NOT EXISTS` requires installation privileges and must not be run through the read-only provisioner.
- `CREATE OR REPLACE FUNCTION` can preserve existing function ownership and grants. Before execution, inspect for a pre-existing function and fail closed; prefer first-install-only semantics.
- PostgreSQL functions grant EXECUTE to PUBLIC by default; creation and REVOKE must be in one transaction.
- A SECURITY DEFINER function must not be owned by a superuser, application runtime role, or broad table owner. Review its exact owner, role memberships, schema USAGE, table INSERT/SELECT rights, and any inherited/default privileges.
- Verify audit triggers, column defaults, ownership, and search_path resolution in the target schema. A test role with direct DML privileges is not an adequate simulation of least privilege.
- Do not grant EXECUTE or connect an application/CLI until separate written authorization for the precise demo-only operation.

**Approval gate:** successful isolated concurrency and rollback runs, signed-off privilege inventory, fresh verified backup, confirmed Railway demo identity, and explicit owner approval for the exact two-row live write.
