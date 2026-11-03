# One-time synthetic demo creation: restricted SQL security design

**Status:** proposal for review; NOT EXECUTABLE and NOT AUTHORIZED for live deployment.

## Verified evidence (demo only)
- Railway preflight returned `canCreate: true`, `existingOrganization: null`, and `writesPerformed: 0` for `trace-demo-lab`.
- Live `Organization` and `AuditEvent` tables are owned by `postgres`, with RLS disabled and no policies. `Organization` has zero user triggers; `AuditEvent` has one.
- Live trigger definition: `AuditEvent_no_update_delete` BEFORE DELETE OR UPDATE, invoking `prevent_audit_event_mutation()`. Source migration raises an exception on mutation.
- The existing `trace_demo_preflight_ro` must remain unchanged. The dedicated provisioner Railway service remains disabled and has no database credentials.

## Recommended capability boundary
1. Keep the preparation role `trace_demo_provisioner` without INSERT, UPDATE, or DELETE on either table; never relax the preparation gate. Do not make this role a table owner, schema owner, superuser, or member of a write-capable role.
2. Prefer a **separate, single-purpose SECURITY DEFINER routine**, created and owned by a dedicated no-login role with only the minimum INSERT/SELECT permissions necessary. The execution role gets EXECUTE on this one routine, not direct table writes. No UPDATE/DELETE grants.
3. The routine must accept **no caller-controlled organization names, login codes, audit actions, actor IDs, or JSON**. Hard-code `trace-demo-lab`, explicitly `active=false`, fictional names, and `DEMO_TENANT_PROVISIONED` with `synthetic=true`. Return only the new IDs and status.
4. Enforce the unique login-code constraint and a transaction-scoped advisory lock or equivalent concurrency protection. Reject if the login code already exists; insert exactly one organization and one audit event in the same transaction. Any audit insert failure rolls back organization creation.
5. Use a fixed `search_path` (trusted `pg_catalog` and explicit schema qualification), no dynamic SQL, no untrusted extensions, and no SECURITY DEFINER owner with BYPASSRLS or superuser privilege. Revoke PUBLIC EXECUTE and avoid default PUBLIC grants.
6. Before execution, verify current database/host/environment/service identity independently, actual column defaults and constraints, function owner and effective privileges, no unexpected role memberships, and no other executable routine grants.
7. Keep the one-time EXECUTE grant disabled until explicit approval. Record exact approved SQL, expected row changes, backup identifier, recovery plan, and authorization. In one tightly controlled window, grant EXECUTE, run exactly once, revoke EXECUTE, disconnect credentials, and disable the service. If execution fails, revoke EXECUTE and investigate; do not retry blindly.
8. Verify read-only: exactly one inactive `trace-demo-lab` row, exactly one linked synthetic provisioning audit event, no pre-existing tenant changes, no unexpected privilege grants, and append-only trigger intact.

## Required review before implementing SQL
- PostgreSQL actual DDL and defaults for `Organization` and `AuditEvent` including UUID generation, `updatedAt`, foreign keys, unique constraints, and index definitions.
- Whether database-level privilege separation can prevent the routine owner from inserting arbitrary data outside this routine. A narrowly scoped function is a software boundary, **not** a substitute for reviewing its owner privileges.
- Role login policy, NOINHERIT and membership, schema CREATE and TEMP privileges, and whether default privileges expose routine execution.
- Restore-test evidence and safe rollback: append-only audit prevents destructive rollback; recovery should favor disabling access and correcting via controlled audit events. Database restore requires a separately approved incident procedure.
- Exact expected audit metadata, monitoring, operator identity and authorization evidence, idempotency behavior, and post-use credential revocation.

## Explicitly prohibited in this proposal
No live role or function creation, no grants, no credentials, no Railway provisioner activation, no database writes, no existing organization edits, no PHI, and no fabricated approvals/signatures. Production and Orange County Labs are out of scope.

**Next engineering step:** implement a read-only inspection of the live column/constraint/privilege facts, then review a concrete SQL implementation with tests. The present document is not permission to run it.
