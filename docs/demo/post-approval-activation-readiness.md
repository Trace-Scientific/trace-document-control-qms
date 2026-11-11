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

## Current state and verified evidence (2026-11-11)

- PR #421 remains draft and unmerged. All six GitHub Actions workflows were independently confirmed successful for commit `764414e63700229f7e8f3c7e4b1198c252f07c5c`: `CI`, `Security`, `Demo offline fixture validation`, `Demo SQL disposable concurrency verification`, `Demo SQL migration-faithful integration`, and `Demo fixtures migrated-schema smoke`. Reconfirm against the final PR head before approval.
- The project owner reports that an independent security specialist reviewed restricted PostgreSQL provisioning and found no inconsistencies. This is a **reported favorable review**, not yet independently verified attributable approval of the final PR commit. Preserve the specialist's identity, written findings, reviewed commit SHA, residual risks, and explicit GitHub PR review or equivalent approval record before closing gate 1.
- Disposable migrated-PostgreSQL integration tests now exercise six synthetic document drafts, submission into a reviewer/approver workflow, premature signature rollback, real password reauthentication and signature confirmation, failed password evidence, successful signature-backed approval, replay and cross-tenant denial, and approved-to-effective publication with review scheduling and audit events. The test simulates review-task completion, and publication webhooks use an injected fake publisher. This evidence does **not** establish a complete live user-interface workflow, external webhook delivery, demo login/MFA, or operational readiness.
- Fixture documents are initially created as synthetic drafts even when the manifest labels their intended demonstration states differently. The tested approval/effectiveness flow covers one fixture; it does not mean all six are pre-populated in their final customer-demo states.
- **No Railway provisioning, activation, merge, or production change is authorized or performed.**

## Evidence handoff checklist

- [x] Six successful workflow conclusions independently verified for commit `764414e63700229f7e8f3c7e4b1198c252f07c5c`.
- [x] Owner-reported favorable independent review documented with its evidence limitations.
- [x] Disposable migrated-schema integration tests exercise signature-backed approval and linked audit/authentication evidence; review-stage completion is simulated.
- [x] Disposable migrated-schema integration tests exercise approved-to-effective publication, review scheduling, audit events, and a fake webhook publisher.
- [ ] Obtain attributable written independent review, reviewed SQL/commit hash, and residual-risk disposition; confirm it covers the final provisioning code.
- [ ] Confirm final PR head passes all required checks after any additional commits.
- [ ] Test the actual review-completion command, UI-driven signature flow, demo login/MFA, and external webhook delivery where required for customer demonstrations.
- [ ] Record a separately authorized merge decision, if desired.
- [ ] Before any **separately authorized** demo-only write, verify fresh backup/restore, exact target identity, role ACLs, target absence, operator and rollback plan.
- [ ] After authorized activation, rehearse synthetic-only customer walkthrough, tenant isolation, login/MFA, and reset/recovery.
