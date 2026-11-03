# Railway demo provisioner: restricted database role plan (NOT EXECUTABLE)

Status: design only. No credentials, role creation, grants, deployment, or writes are authorized by this document.

## Fixed scope
- Railway project: `e6cc5f1e-3064-46d3-90bf-c763334f01a8`
- Demo environment: `3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4`
- Demo PostgreSQL service: `7f2ad369-c21a-486a-8ac4-4a170b1674d3`
- Dedicated provisioner service: `be0f039a-cfad-46c7-a360-95bf0eeefb8c`
- Target organization login code: `trace-demo-lab`; created inactive, synthetic only.

## Separate identities and stages
1. Existing `trace_demo_preflight_ro` remains read-only and unchanged.
2. Proposed `trace_demo_provisioner` must be a new, non-superuser, non-owner, NOINHERIT role with no CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS. Never reuse the app or admin database credentials.
3. **Preparation stage:** the role has SELECT only on the exact fields/tables needed for identity and collision checks, and zero INSERT/UPDATE/DELETE grants on Organization and AuditEvent. The `railway-demo-provisioner-role-gate.mjs` inspector requires read-only transaction mode and no table write privileges. No provisioner source or credentials are deployed.
4. **Separately approved one-time creation stage:** after successful preparation, establish a narrowly scoped, temporary insert-only path for Organization and AuditEvent, ideally via a vetted SECURITY DEFINER function owned by a dedicated least-privilege owner, rather than permanent unrestricted table INSERT grants. The function must hard-code the synthetic target and metadata, perform the duplicate check and both inserts atomically, and reject all other mutations. Design and review this function separately. Never allow UPDATE or DELETE. Revoke execution permissions after one approved use.
5. **Verification stage:** confirm exactly one inactive synthetic organization and one matching audit record, no other changes, then remove temporary access and disable the provisioner again.

## Before any live SQL
- Review the actual Prisma schema, constraints, audit defaults, PostgreSQL table ownership, RLS policies, triggers, and sequence privileges; do not assume grants are sufficient or safe.
- Confirm the demo database identity using an independent read-only preflight and inspect the exact proposed SQL with a qualified reviewer.
- Capture a verified restorable backup and rollback/recovery plan.
- Require explicit owner authorization specifying the exact one-time creation operation; prior general "proceed" messages are not approval for a live database write.
- Do not store secrets or passwords in GitHub, PR descriptions, logs, or this document.
- No changes to QMS production or Orange County Labs. No PHI or fabricated approval/signature events.

## Important security distinction
The preparation role gate **rejects any INSERT permission**. It is not suitable as the write-stage authorization gate. A separate, reviewed write-stage attestation and one-time authorization mechanism must be implemented and tested before creation. Do not relax the read-only preparation gate to enable writes.
