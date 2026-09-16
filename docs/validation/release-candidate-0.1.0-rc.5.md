# Release candidate 0.1.0-rc.5

## Purpose

`0.1.0-rc.5` is the post-UAT and post-security validation candidate for Trace QMS. It supersedes `0.1.0-rc.4` as the current candidate while preserving the `rc.4` record as historical evidence.

Candidate designation is not a claim that the software is validated, approved for regulated production use, or certified against any regulatory or accreditation framework.

## Source baseline

The candidate branch was created from `main` at commit:

`71ddc0b9d9f9301c9770e730cbcd147dcbbfd4e9`

The authoritative `0.1.0-rc.5` candidate SHA is the final merge commit produced when the release-candidate reconciliation pull request is merged into `main`. That SHA must be recorded in the controlled validation and deployment evidence before qualification begins.

Validation application and migration images must be built from that exact source SHA and referenced by immutable image digest.

## Included post-rc.4 acceptance work

The current candidate incorporates the completed product-review, UAT, security, readback, and pre-validation hardening work merged after the earlier candidate designation. Representative changes include:

- PR #228 — Training date-only display, fresh reads, and duplicate-assignment guard.
- PR #229 — immutable Training completion-history readback.
- PR #230 — Competency expiration date-only display correction.
- PR #235 — Administration existing scoped-role assignment and effective-access readback.
- PR #236 — Administration least-privilege/cache-boundary security hardening.
- PR #237 — Quality closure and electronic-signature historical evidence readback.
- PR #238 — no-op Equipment schedule-correction guard and friendly Administration permission descriptions.

This list is representative rather than exhaustive. The authoritative candidate contents are the files committed at the final candidate SHA.

## Release identity reconciliation

For `0.1.0-rc.5`:

- `package.json` and the root `package-lock.json` metadata use the same release version.
- The dependency versions, resolved packages, and integrity records remain governed by the existing lockfile; candidate reconciliation does not intentionally upgrade dependencies.
- Docker application and migration image version defaults identify `0.1.0-rc.5`.
- AWS validation service documentation/template defaults identify `0.1.0-rc.5`.
- The protected AWS validation release workflow defaults to `0.1.0-rc.5` and still requires the exact full source SHA.
- CI verifies package-manifest/lockfile release-version consistency before dependency installation and uses `0.1.0-rc.5` for production smoke evidence.

## Validation boundary

Railway remains a development preview restricted to synthetic data. Railway product-review/UAT evidence may support defect discovery and candidate selection, but it does not substitute for protected validation-environment qualification or formal validation execution.

Before `0.1.0-rc.5` can be approved for regulated production use, the controlled validation/release process must include, as applicable:

1. successful CI and Security for the exact candidate SHA;
2. Prisma schema/migration verification and database integrity evidence;
3. backup/restore and recovery evidence appropriate to the qualified environment;
4. successful production and private-network migration container builds;
5. protected AWS validation deployment using immutable application and migration image digests;
6. recording of exact deployed source SHA, release version, task-definition/image evidence, and migration result;
7. liveness and readiness evidence in the qualified validation environment;
8. execution of applicable critical-workflow UAT protocols with synthetic validation data;
9. controlled deviation, correction, and retest evidence when required;
10. residual-risk review and disposition;
11. required Quality, Security, and Service/Product Owner approvals; and
12. a controlled production-release decision that remains separate from successful validation deployment alone.

Any source change after the final `0.1.0-rc.5` candidate SHA is frozen must be handled through controlled change/deviation assessment and must receive the level of regression testing or revalidation required by its impact.
