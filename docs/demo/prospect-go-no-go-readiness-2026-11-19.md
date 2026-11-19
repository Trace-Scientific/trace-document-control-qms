# Prospect demo go/no-go readiness — 2026-11-19

Baseline: 66a88b4365dba33746a89458629db50a41392a9e (PR #476). **NO-GO for prospect credentials.** This is evidence reconciliation, not live authenticated acceptance or regulated production approval.

## Evidence and remaining decisions

| Control | Existing evidence | Remaining acceptance |
| --- | --- | --- |
| ISO-01/02 | PR #474 and #475: bidirectional disposable PostgreSQL read, draft-write and submission denials, unchanged-state assertions; CI/Security passed | Live authenticated cross-tenant negative requests in both directions and read-only postconditions |
| ISO-03 | PR #476: approver-only reviewer-action denial; existing fixture covers reviewer-only final-signature denial and authorized review/approval | Live persona UI/API separation and sanitized evidence |
| ISO-04 | Read-only demo preflight and PR #458 inactive Lab B provisioning | Independent environment identity attestation and any approved isolated negative checks |
| ISO-05 | Repository authorization and support controls | Live synthetic persona platform-admin and support boundary negative tests |
| ISO-06 | Issue #459 scoped review: five document versions, 55 audit events, operator inbox, private-file list, training and competency | Review any additional prospect-visible personas, exports and attachments, then sign off scope |
| REC-01 | PR #457 checksum-verified isolated November 18 restore, 206 tables | Named independent reviewer sign-off |
| REC-02 | Separate demo and preview environments documented | Independently attest reset/production boundary; no live reset without separate approval |
| OPS-01 | No prospect credential approval | Signed owner/security decision, recipients, delivery, expiry, revocation and incident contact |

## Minimum execution order

1. Read-only inventory of demo environment, deployed commit, database identity and existing approved synthetic accounts.
2. Determine whether bidirectional live tests require a second synthetic tenant fixture. Lab B is inactive, with no users or documents; obtain distinct approval before activation, grants, credentials or test-data writes.
3. Execute only authorized authenticated live ISO-01/02/03/05 checks. Record UTC time, commit, environment, synthetic identities, sanitized requests/results, unchanged-state evidence and reviewer.
4. Complete evidence-only reviewer decisions for ISO-06, REC-01 and REC-02; avoid repeating successful recovery procedures without cause.
5. Obtain signed OPS-01 approval before distributing any prospect login.

## Decision record

- Decision: **NO-GO** for prospect credentials.
- Owner/security reviewer: pending.
- Live acceptance evidence: pending.
- Recipients and credential method: not approved.
- Expiry/revocation and incident contact: pending.
- Original demo lab: preserve existing fictional records and operator-led walkthrough.
- Lab B: remain inactive; no live database changes authorized.
- Railway environment named production: synthetic development preview, not regulated production release.

## Sources

- [Security acceptance matrix](security-acceptance-matrix.md)
- [Evidence reconciliation](acceptance-evidence-reconciliation-2026-11-18.md)
- [PR #474](https://github.com/Trace-Scientific/trace-document-control-qms/pull/474)
- [PR #475](https://github.com/Trace-Scientific/trace-document-control-qms/pull/475)
- [PR #476](https://github.com/Trace-Scientific/trace-document-control-qms/pull/476)
- [PR #457](https://github.com/Trace-Scientific/trace-document-control-qms/pull/457)
- [PR #458](https://github.com/Trace-Scientific/trace-document-control-qms/pull/458)
- [Issue #459](https://github.com/Trace-Scientific/trace-document-control-qms/issues/459)
