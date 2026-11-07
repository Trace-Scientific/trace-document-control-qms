# One-time demo tenant provisioning: verified contract and implementation gate

**Status: REVIEW ONLY. No executable provisioning, SQL grants, live database writes, or deployment authorization.**

## Scope
- Railway **demo** environment only; never production or Orange County Labs.
- Proposed synthetic organization: `trace-demo-lab`, legal name `Trace Demo Laboratory LLC`, display name `Trace Demo Laboratory`, timezone `America/Los_Angeles`, `active=false`.
- Initial write-stage transaction: exactly one Organization and one linked AuditEvent with action `DEMO_TENANT_PROVISIONED`, entityType `Organization`, entityId = new Organization.id, metadata containing `{"synthetic":true}`; actorUserId NULL. No users or documents created in this first stage.

## Read-only evidence provided November 7, 2026
- Organization has eight columns. id defaults to gen_random_uuid(); updatedAt is NOT NULL with **no database default** and must be explicitly populated.
- AuditEvent has fourteen columns; id defaults to gen_random_uuid(), occurredAt defaults to CURRENT_TIMESTAMP, metadata defaults to '{}'::jsonb.
- `SELECT ... WHERE "loginCode"='trace-demo-lab'` returned zero rows (point-in-time observation; recheck immediately before any approved write).
- Unique indexes: `Organization_loginCode_key` on loginCode, `Organization_pkey` on id.
- AuditEvent trigger: `AuditEvent_no_update_delete` BEFORE DELETE OR UPDATE invokes `prevent_audit_event_mutation()`. Trigger presence confirmed, not behavior tested.
- Foreign-key constraints were reviewed in console; capture exact definitions in a machine-readable evidence artifact before implementation.
- `trace_demo_provisioner`: LOGIN true; SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS/INHERIT false; default_transaction_read_only=on; no granted role memberships.
- `trace_demo_provisioner`: Organization SELECT true, INSERT/UPDATE/DELETE false; AuditEvent SELECT/INSERT/UPDATE/DELETE false; public schema USAGE true, CREATE false; database CREATE false.
- Independent isolated restore of Nov 7 backup passed checksum and restored 204 application tables. This is not a validated production recovery-time objective.

## Required implementation and review
1. Keep `trace_demo_provisioner` and `trace_demo_preflight_ro` read-only. Do **not** give either role write grants or modify their existing gate.
2. Capture actual schema constraints, trigger function, ownership, role memberships, default function privileges, and all relevant grants as sanitized read-only evidence. Recheck demo service/database identity.
3. Implement a separately reviewed, **no-login**, least-privilege owner and a single-purpose SECURITY DEFINER function, with fixed trusted search_path and schema-qualified references. No dynamic SQL or caller-controlled values; hard-code the target and synthetic metadata.
4. Ensure exactly one Organization INSERT with explicitly supplied updatedAt and active=false, and exactly one AuditEvent INSERT in the **same transaction**. Use an advisory transaction lock and unique constraint; abort on duplicate loginCode. Never create fabricated signatures, approvals, or PHI.
5. REVOKE EXECUTE FROM PUBLIC and audit default privileges. A distinct ephemeral execution identity may receive EXECUTE **only for the approved one-time window**, with no direct table INSERT/UPDATE/DELETE grants. Verify no other routine or schema capabilities are available.
6. Test on disposable PostgreSQL 18: first creation; second creation rejected; concurrent invocations yield at most one tenant; audit insert failure rolls back organization; unexpected schema/role fails closed; existing organizations unchanged; no update/delete path; revoke prevents replay.
7. Before live execution: independent database identity check; fresh backup and verified recovery plan; exact SQL reviewed; written owner authorization identifying one-time demo tenant creation and expected two rows; separate approval for temporary EXECUTE grant.
8. After a separately authorized execution: immediately revoke EXECUTE, remove credentials/disable runner, and verify exactly one inactive synthetic organization and one linked audit event with no other changes. Do not delete audit records for rollback.

## Customer-ready demo is a separate phase
This first step does **not** create users, credentials, workflows, training records, documents, or customer-ready content. Those require a distinct synthetic fixture design, permissions review, and authorization.

## Acceptance
- [ ] Live read-only schema evidence captured and reviewed
- [ ] SQL routine and least-privilege grants reviewed
- [ ] Disposable-database integration tests pass
- [ ] Production paths excluded and demo identity verified
- [ ] Fresh backup/recovery evidence recorded
- [ ] Explicit owner approval obtained for exact one-time operation
- [ ] Post-execution privilege revocation and verification plan approved

**Do not merge this review document as evidence that live execution has been authorized.**
