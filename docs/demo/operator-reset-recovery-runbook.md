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
