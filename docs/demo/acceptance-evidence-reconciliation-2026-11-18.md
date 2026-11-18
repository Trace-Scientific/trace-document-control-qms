# Demo acceptance evidence reconciliation — November 18, 2026

This document reconciles the current repository evidence. It is **not** a live security test pass, authorization to grant accounts, or approval to distribute prospect credentials.

## Verified facts and evidence boundaries

| Item | Evidence | Disposition |
| --- | --- | --- |
| Current baseline | Main commit `9b458febe5cd5da815372adfb45d7b6672c63f9b` (PR #471) | Workflow improvements merged; does not establish live tenant isolation |
| Isolated authorization regression | PR #457 disposable PostgreSQL tests and CI | Passed in isolated test infrastructure; ISO-01/02 live checks remain open |
| Recovery | PR #457 records checksum verification and isolated restore of `trace-qms-demo-20261118T030421Z.backup` (206 application tables) | Technical restore evidence; independent reviewer sign-off remains open |
| Lab B | PR #458 post-commit read-only verification: inactive organization `998feb59-065e-4948-bbe3-c136471cb8c4`, one linked provisioning audit event, no users or documents, execution privileges revoked | Already provisioned; do not re-provision, activate, or grant access by inference |
| Operator-led walkthrough | Issue #459 covers five document versions, 55 visible audit events, empty private-file table and operator inbox, and FRM-002 guided flow | Scoped screen-level synthetic-data review; not a blanket ISO-06 pass |
| Training and competency | Issue #459 records Taylor Demo sample training and competency demonstrations | Operator-led demo content available; no additional submissions necessary |

## Remaining acceptance actions

1. **ISO-01/02:** Determine whether a separately approved pair of synthetic login accounts, one per tenant, is necessary for authenticated bidirectional read and write denial tests. The existing inactive Lab B has no users. Obtain distinct approval before any activation, role grant, or credential creation. Verify denied requests and unchanged document, workflow, and audit state.
2. **ISO-03/05:** Exercise authorized and unauthorized reviewer/final-approver actions and platform-admin boundaries using approved synthetic personas. Capture sanitized HTTP results and read-only postcondition evidence.
3. **ISO-04/REC-02:** Reconcile current demo environment identity and preflight results with existing disposable provisioning tests; separately approve any live reset/rollback exercise. Never reset the original demo merely to satisfy documentation.
4. **ISO-06:** Retain the issue #459 operator-led scope. Review any additional persona inbox, actual export output, or attachment storage **only if** those surfaces are included in the prospect walkthrough.
5. **REC-01:** Obtain named independent reviewer acceptance for the latest isolated restore evidence.
6. **OPS-01:** Record owner/security go/no-go, approved recipient and credential distribution process, expiry/revocation, and incident contact **before** prospect sign-in.

## Execution guardrails

- Keep `trace-demo-lab` as the guided presentation tenant and preserve existing fictional records.
- Lab B's inactive, empty state is intentional. Do not create users, documents, grants, or activate it without separately documented authorization.
- Use disposable databases for repeatable automated negative tests.
- Record commit SHA, environment, UTC time, sanitized procedure/results, reviewer and disposition for each live acceptance case.
- Do not treat Railway's environment named `production` as regulated production approval.
- Prospect sign-in remains **NO-GO** until all applicable live security checks and explicit OPS-01 approval are complete.

## References

- [Acceptance matrix](security-acceptance-matrix.md)
- [Lab B provisioning review, PR #458](https://github.com/Trace-Scientific/trace-document-control-qms/pull/458)
- [Authorization and recovery evidence, PR #457](https://github.com/Trace-Scientific/trace-document-control-qms/pull/457)
- [Scoped walkthrough and synthetic-data review, issue #459](https://github.com/Trace-Scientific/trace-document-control-qms/issues/459)
