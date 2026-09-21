# Release candidate 0.1.0-rc.6

## Purpose

`0.1.0-rc.6` is the next controlled AWS validation candidate for Trace QMS. It supersedes `0.1.0-rc.5` as the current candidate while preserving all rc.5 evidence as historical.

Candidate designation does not mean the software is validated, approved for regulated production use, or certified against any regulatory or accreditation framework.

## Source baseline

This candidate reconciliation branch was created from controlled `main` at:

`dff301625079ccb0fc256eca4f8ce449a8a5215c`

The authoritative `0.1.0-rc.6` candidate SHA is the final squash-merge commit produced when this reconciliation pull request is merged into `main`. That exact 40-character SHA must be used for protected AWS foundation/service validation evidence and immutable application/migration images.

## Reason for new candidate

Post-rc.5 work materially changed the governed platform/manual path and therefore must not be deployed to the qualified AWS validation environment under the stale rc.5 candidate identity.

Representative post-rc.5 changes include:

- PR #302 — governed UM-QMS-001 draft assembly and unscheduled DRAFT release support.
- PR #303 — production-build typing correction for manual authoring.
- PR #304 — authorized Platform Administration / Help & User Manual discoverability.
- PR #305 — controlled audited platform-administrator bootstrap.
- PR #306 — true reviewed-draft assembly idempotency and exact future revision-ID evidence.
- PR #307 — automatic fail-closed manual readiness verification on workspace load.

The Railway preview evidence confirms UM-QMS-001 v0.1 remains DRAFT, unpublished, unscheduled, and bound to 16 frozen section revisions. Railway remains synthetic-data development preview only.

## Release identity reconciliation

For `0.1.0-rc.6`:

- `package.json` and root `package-lock.json` identify the same release version.
- Docker application and migration build defaults identify `0.1.0-rc.6`.
- CI production-smoke release identity uses `0.1.0-rc.6`.
- AWS validation service template/documentation defaults identify `0.1.0-rc.6`.
- The protected AWS validation release workflow defaults to `0.1.0-rc.6`.
- The root README identifies rc.6 as the current candidate.

No dependency upgrade is intended by this candidate reconciliation.

## AWS validation boundary

Before rc.6 may be used for regulated production release, the protected validation process must include:

1. CI and Security success for the exact final rc.6 SHA;
2. approved AWS validation foundation PLAN and APPLY with protected GitHub environment review;
3. immutable application and migration images built from the exact rc.6 SHA and referenced by digest;
4. private-network migration completion with exit code zero before application activation;
5. qualified service deployment using the reviewed CloudFormation change set;
6. liveness/readiness and application qualification evidence;
7. backup/restore and Tier 1 recovery exercises;
8. applicable controlled UAT with synthetic validation data;
9. deviation/correction/retest evidence where required;
10. residual-risk review and required independent approvals; and
11. a separate controlled production-release decision.

## Manual publication boundary

UM-QMS-001 v0.1 remains DRAFT during AWS pre-production provisioning and qualification. Do not assign an effective date or publish the manual merely because the validation infrastructure or application deployment succeeds.
