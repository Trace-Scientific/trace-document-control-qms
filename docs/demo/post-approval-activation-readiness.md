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

- PR #421 remains draft and unmerged. All six GitHub Actions workflows were independently confirmed successful for commit `b78bbb4cb9e6ec5244fe3a93247d6c7efab26d5f`: `CI`, `Security`, `Demo offline fixture validation`, `Demo SQL disposable concurrency verification`, `Demo SQL migration-faithful integration`, and `Demo fixtures migrated-schema smoke`. Reconfirm against the final PR head before approval.
- The project owner reports that an independent security specialist reviewed restricted PostgreSQL provisioning and found no inconsistencies. This is a **reported favorable review**, not yet independently verified attributable approval of the final PR commit. Preserve the specialist's identity, written findings, reviewed commit SHA, residual risks, and explicit GitHub PR review or equivalent approval record before closing gate 1.
- Disposable migrated-PostgreSQL integration tests now exercise six synthetic document drafts, submission into a reviewer/approver workflow, premature signature rollback, real password reauthentication and signature confirmation, failed password evidence, successful signature-backed approval, replay and cross-tenant denial, approved-to-effective publication, retirement, successor-revision restrictions, and automatic supersession with review scheduling and audit events. The test now completes reviewer acceptance through the real authorized WorkflowReviewService and Prisma store, and takes a successor revision from DRAFT through submission, reviewer acceptance, password-reauthenticated electronic signature, APPROVED, and automatic supersession on publication. The original supersession source is seeded EFFECTIVE to isolate the replacement workflow. Publication webhooks still use an injected fake publisher. This evidence does **not** establish a complete live user-interface workflow, external webhook delivery, demo login/MFA, or operational readiness.
- Fixture documents are initially created as synthetic drafts even when the manifest labels their intended demonstration states differently. The tested approval/effectiveness flow covers one fixture; it does not mean all six are pre-populated in their final customer-demo states.
- **No Railway provisioning, activation, merge, or production change is authorized or performed.**

## Authentication implementation and remaining release gates (2026-11-13)

- The earlier 2026-11-11 finding that MFA was not implemented is superseded by subsequent branch changes. Password login now issues a short-lived, server-stored MFA challenge for MFA-enabled users and does **not** issue a session until successful TOTP verification. The MFA verification API issues an HttpOnly, SameSite=Strict session cookie on success and sends no-store responses.
- TOTP enrollment uses fresh password reauthentication, an encrypted factor secret, a ten-minute pending-enrollment window, attempt limits, and a feature flag (`QMS_MFA_ENROLLMENT_ENABLED`, disabled unless explicitly enabled). Verification includes challenge expiry, five-attempt lockout, tenant and user eligibility, one-time challenge consumption, TOTP replay protection, and serializable transaction retries.
- Unit and API tests cover these paths, including disabled factors, invalid codes, expired and consumed challenges, concurrent reservation conflicts, and retry exhaustion. All six GitHub workflows were independently verified successful on commit `6092040bd5801282d7d13ccd5e851f63e4d253a8`; later commit `be4ad1427ed0a6116478129be449cdd7579d2b0f` was also verified successful. **Reconfirm the final PR head after any additional changes.**
- **Not yet demonstrated:** a full browser-driven password → challenge → TOTP → session journey against disposable migrated PostgreSQL; real MFA enrollment through the UI; account recovery; session expiry and electronic-signature reauthentication in a deployed demo; independent review of the final authentication changes. Existing disposable document-workflow integration tests do not substitute for these checks.
- **Release decision:** do not advertise MFA as fully validated or enable the demo feature flag solely because unit tests pass. Resolve the remaining end-to-end evidence and obtain the required independent review and separate owner approvals before any merge or live demo activation.

## Evidence handoff checklist

- [x] Six successful workflow conclusions independently verified for commit `b78bbb4cb9e6ec5244fe3a93247d6c7efab26d5f` (before this documentation update).
- [x] Owner-reported favorable independent review documented with its evidence limitations.
- [x] Disposable migrated-schema integration tests exercise signature-backed approval and linked audit/authentication evidence; review-stage completion uses the actual reviewer service and transaction.
- [x] Disposable migrated-schema integration tests exercise approved-to-effective publication, retirement, successor revision eligibility and history, automatic supersession, review scheduling, audit events, and a fake webhook publisher. Supersession now includes a real submitted, reviewed, electronically signed successor; the original effective source is seeded for test setup.
- [ ] Obtain attributable written independent review, reviewed SQL/commit hash, and residual-risk disposition; confirm it covers the final provisioning code.
- [ ] Confirm final PR head passes all required checks after any additional commits.
- [x] Test the actual reviewer-completion command and end-to-end signature approval for a successor revision in disposable PostgreSQL.
- [ ] Test UI-driven signature flow, demo login/MFA, and external webhook delivery where required for customer demonstrations.
- [ ] Record a separately authorized merge decision, if desired.
- [ ] Before any **separately authorized** demo-only write, verify fresh backup/restore, exact target identity, role ACLs, target absence, operator and rollback plan.
- [ ] After authorized activation, rehearse synthetic-only customer walkthrough, tenant isolation, login/MFA, and reset/recovery.
