# Trace QMS demo activation — post-approval readiness plan

**Planning document only.** Do not execute SQL, change Railway permissions, deploy a new tenant, or merge PR #421 as a result of this checklist.

## Decision gates

1. External reviewer delivers attributable written findings and GitHub approval of the final PR #421 commit. Resolve all high/critical findings and rerun CI.
2. Project owner explicitly authorizes PR merge. Confirm merged code is review-only and does not install or invoke SQL through migrations, startup, CI, or deployment.
3. **Separate authorization required for live Railway demo changes**: name exact environment, database, authorized operator, SQL hash, execution window, and rollback plan. Never use production.

## Pre-execution evidence — demo only

- Verify Railway project, environment, service, database identity and credentials through read-only queries; record timestamp and operator. Stop on any mismatch.
- Confirm no existing Organization has loginCode `trace-demo-lab` and no pre-existing `demo_one_time` schema. Stop on unexpected state.
- Verify current demo-only backup exists, has a recorded checksum, and has been restore-tested to a separate isolated database. Do not assume older backups are sufficient.
- Inspect PostgreSQL server version and actual effective privileges, including ownership, role memberships, inherited rights, schema USAGE/CREATE, table SELECT/INSERT, function EXECUTE, RLS, triggers and default ACLs.
- Confirm the restricted NOLOGIN owner and separately controlled executor cannot access production and have only approved privileges.
- Confirm the final reviewed SQL file SHA/hash and the reviewed PR commit match the proposed operation.
- Obtain written approval for the **specific** demo-only install/invocation. Do not infer approval from CI or merge.

## Controlled activation (only after separate authorization)

- Use a change record identifying operator, approved statements, expected effects, and stop conditions.
- Install only the reviewed first-install SQL as the approved restricted owner; verify PUBLIC access remains revoked.
- Grant any approved temporary EXECUTE only to the named restricted caller, not PUBLIC.
- Invoke at most once and verify exactly one **inactive**, synthetic Organization and exactly one linked provisioning AuditEvent; confirm no other tenant rows changed.
- Revoke temporary EXECUTE promptly; verify final effective ACLs.
- Record SQL outcomes and audit references without storing passwords, tokens, or customer data in GitHub.

## Rollback and incident response

- If any preflight differs, **stop before write** and request review; never improvise schema/role changes.
- On failed transaction, verify that no partial Organization/AuditEvent row remains.
- If an unexpected committed state exists, halt further writes, preserve evidence, and obtain a separately approved recovery plan; do not delete tenant or audit evidence ad hoc.
- Restore from the verified isolated backup only under a separate recovery authorization.

## Customer demonstration readiness (separate from provisioning)

- Confirm demo organization is deliberately activated only after a separate readiness decision.
- Populate only synthetic users, documents, workflows, training records and audit events; no real patient/customer information.
- Test tenant isolation, demo login/MFA, role restrictions, document versioning/approval, notifications, audit visibility, and reset/recovery.
- Verify public demo URLs, availability, support contact, and a rehearsed 15-minute walkthrough.
- Maintain a clear demo reset procedure and prohibit cross-tenant access.

## Current state

- PR #421 has passing reported CI and an external-review package.
- Independent reviewer approval is pending.
- No live Railway provisioning, activation, or production change is authorized or performed.
