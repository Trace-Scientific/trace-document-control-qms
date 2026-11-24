# Trace QMS — Demo operator reset and recovery runbook

**Status:** Draft operational procedure. Read-only triage is permitted; destructive reset, restore, tenant creation, role changes, and external customer access require separate documented authorization.

**Scope:** The existing synthetic Railway demo application and its explicitly identified demo database. This runbook must not be used against production or an unidentified database. The existing `trace-demo-lab` one-time provisioning plan is a separate workflow.

## 1. Operator preflight — before each prospect session

1. Record the session date, operator, expected demo URL, Railway project, environment ID, service ID, deployment commit, and synthetic organization identifier. Obtain these values from the live deployment; do not infer them from the public hostname.
2. Confirm the Railway project/environment and database are explicitly the **demo** resources. If any identity is missing, mismatched, or points to production, stop.
3. Confirm application health and last deployment status. A successful deployment is not evidence of database restore readiness.
4. Confirm the demo contains no real patient, customer, or employee records. If the data classification is unknown, do not invite external users.
5. Verify fictional demo accounts have only their intended permissions. Do not display, copy into tickets, or share passwords.
6. Verify the expected demonstration documents are present: TEST-001 v0.1 EFFECTIVE and FRM-002 v0.1 SUPERSEDED / v0.2 EFFECTIVE, when these records still exist.
7. Check that reviewer-only actions are absent from the final approver's view. Record a blocker if the deployed demo build has not been checked.
8. Record the latest backup's timestamp, storage location, checksum/verification result, and independent restore-test evidence. Do not equate an uploaded backup with a successful restore test.
9. Confirm a named approver and recovery operator are available before any action that could modify or replace demo data.

## 2. Read-only incident triage

If login, document navigation, review, approval, or publication fails:

1. Stop the live demo action. Do not retry state-changing actions repeatedly; a request may have succeeded despite a UI timeout.
2. Record timestamp, page, fictional persona, affected document number/version, expected and observed behavior, and a redacted screenshot.
3. Check deployment health and sanitized application logs. Do not capture credentials, session tokens, PHI, or secrets.
4. Confirm the document's actual current state through authorized read-only application views before deciding whether a retry is safe.
5. If the issue is isolated to the UI, switch to previously verified read-only screens or end the demonstration. Do not bypass authorization or e-signature requirements.
6. Escalate tenant-isolation anomalies, unexpected real data, or possible credential exposure as security incidents; immediately stop customer access.

## 3. Recovery decision gate

| Condition | Permitted response without new approval | Actions requiring explicit approval |
| --- | --- | --- |
| Application deployment unhealthy | Inspect health, logs, and current commit | Rollback/redeploy when it changes runtime state |
| Demo data missing or inconsistent | Capture evidence and verify backup metadata | Restore, truncate, reseed, or reset |
| Incorrect fictional role assignment | Inspect effective role and assignment read-only | Grant, revoke, impersonate, or alter identity |
| Wrong environment/database identity | Stop immediately | No write until independently verified and approved |
| Unknown data classification | Stop external sharing and escalate | Any customer access or data mutation |
| Document appears stuck after action | Inspect status, lock version, and audit evidence read-only | Re-run or correct governed workflow state |

## 4. Required authorization before any reset or restore

Obtain and record **all** of the following:

- Named product/security owner approval and a separate operator executing the change.
- Exact Railway project, environment, service, database name/identity, and synthetic tenant ID, independently verified against the target.
- Written scope: affected records, intended restore point, expected downtime, and effect on demo users.
- Backup identifier, checksum, retention/storage verification, and successful isolated restore evidence.
- A tested rollback plan and a decision on whether the change could overwrite existing signed/audited records.
- An approved, environment-specific procedure with explicit confirmation gates; do not repurpose local integration-test scripts against Railway.
- A communication plan for any active demonstration sessions.

**Do not execute a reset or restore from this document alone.** It contains no destructive commands by design.

## 5. Controlled recovery execution — separately approved procedure only

1. Freeze demo writes and suspend scheduled customer sessions using the approved operating process.
2. Reconfirm target identity immediately before executing the approved recovery plan.
3. Preserve pre-recovery evidence and the last known good backup.
4. Run the separately reviewed recovery procedure under least-privilege credentials, with monitoring and an operator-approved stop point.
5. Verify post-recovery database identity, synthetic organization, user permissions, document counts, lifecycle states, and audit continuity.
6. Confirm application health, login, read-only library navigation, and the expected effective/superseded examples.
7. Record the result, discrepancies, backup/restore identifiers, approval references, and decision to resume access.
8. Re-enable demo access only after security/product sign-off.

## 6. Post-session evidence log

Record: session date/time; operator; prospect organization (outside demo data); environment and commit; synthetic tenant; demo document versions shown; health status; backup verification reference; any incidents; actions taken; outstanding blockers; sign-off owner.

## 7. Stop conditions

Stop and escalate immediately on any of: production identity or database detected; missing environment attestation; unexpected customer/PHI records; unauthorized cross-tenant access; missing recovery authorization; backup checksum failure; unverifiable restore point; unexplained audit or e-signature inconsistency.

## Related repository material

- [Customer demo readiness gate](customer-demo-readiness-gate.md)
- [15-minute prospect walkthrough](prospect-15-minute-walkthrough.md)
- [One-time provisioning verified contract](one-time-provisioning-verified-contract-2026-11-07.md)
- [Restricted provisioner role plan](restricted-railway-provisioner-role-plan.md)

**Release boundary:** Completing this runbook does not satisfy the independent restore test, tenant isolation tests, external customer access approval, or commercial release gates.

## REC-02 readiness evidence and proposed isolated exercise — November 23, 2026

Read-only Railway inventory confirms project `e6cc5f1e-3064-46d3-90bf-c763334f01a8` contains demo environment `3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4` and production environment `a9b203fd-e19f-4dea-929c-4dac40a14ed1`. Demo application service `9c8676bd-5d9b-4306-8e85-062bd95bf72c` and database service `7f2ad369-c21a-486a-8ac4-4a170b1674d3` differ from production application `6e01faf0-7687-4a8f-b8ec-b15dfc884290` and database `59bc4f68-5df5-4011-9add-7baacf431b7d`. Inventory is not proof of actual database connection identity or reset safety. No production connection or write was attempted.

Proposed exercise (not authorized for execution by this document):

1. Independently attest target database identity and demo-only configuration without exposing credentials; reject missing or mismatched identity.
2. Restore the verified archive into disposable local PostgreSQL with no live database connectivity. Record baseline synthetic tenant, controlled versions, audit continuity and signed records.
3. Identify and review the actual reset implementation and its allowed mutation set before execution. If no suitable implementation exists, stop and prepare a separate implementation proposal.
4. Exercise the reviewed reset against disposable data only, including wrong-target denial and preservation of required audit and signed records. Compare before/after evidence and test rollback using the verified archive.
5. Record commit, archive, timestamps, assertions, discrepancies, operator and independent reviewer. A disposable exercise does not authorize a live reset; obtain separate written approval for any live execution.

REC-01 reviewer record: archive `trace-qms-demo-20261124T015518Z.backup`, deployment `6253d997-fa5c-4e4d-bb34-3b4965aff7e9`, operator James Ramsey, technical PASS for one synthetic file. Independent reviewer name, review date, evidence examined, exceptions and accept/reject decision remain blank pending actual review. Cleanup deployment `fc83c6f6-edd1-4e07-a432-bd59815daaa5` subsequently reported SUCCESS. Full-bucket recovery and scheduled file backups remain open.
