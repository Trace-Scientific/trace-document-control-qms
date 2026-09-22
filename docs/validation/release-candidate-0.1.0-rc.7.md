# Release candidate 0.1.0-rc.7

## Purpose

`0.1.0-rc.7` is the next controlled validation candidate for Trace QMS. It supersedes `0.1.0-rc.6` as the current candidate while preserving all rc.6 evidence as historical and immutable.

Candidate designation does not mean the software is validated, qualified, approved for regulated production use, or certified against any regulatory or accreditation framework.

## Source baseline

This candidate reconciliation branch was created from controlled `main` at:

`3652672d698777a398b4f780a68fbbd7da493260`

The authoritative `0.1.0-rc.7` candidate SHA is the final squash-merge commit produced when this reconciliation pull request is merged into `main`. That exact 40-character SHA must be used for fresh CI/Security evidence and any later protected validation-environment evidence.

## Reason for new candidate

Current `main` materially post-dates historical rc.6. The post-rc.6 baseline includes the completed platform/commercial/Help work, final software completeness review, post-rc.6 traceability/UAT reconciliation, the Railway production typecheck correction, and the final Railway smoke-readiness record.

PR #337 established the final Railway runtime/deployment smoke boundary. All current application services for source SHA `3652672d698777a398b4f780a68fbbd7da493260` subsequently reached `SUCCESS`.

The required authenticated visual/UI review was manually completed by James Ramsey on September 22, 2026 and was reported satisfactory before this candidate reconciliation began.

## Release identity reconciliation

For `0.1.0-rc.7`:

- `package.json` and root `package-lock.json` identify the same release version.
- Docker application and migration build defaults identify `0.1.0-rc.7`.
- CI production-smoke release identity uses `0.1.0-rc.7`.
- AWS validation service template/documentation defaults identify `0.1.0-rc.7`.
- The protected AWS validation release workflow defaults to `0.1.0-rc.7`.
- The root README identifies rc.7 as the current candidate.
- Historical rc.6 records remain unchanged.

No dependency upgrade or application feature change is intended by this candidate reconciliation.

## Candidate evidence boundary

After merge, the exact final rc.7 SHA requires fresh CI/Security evidence. Prior CI or Railway evidence may support development history but must not be substituted for exact-candidate CI/Security evidence.

The current validation requirements and UAT mappings remain planned protocols until executed against the immutable candidate in the approved validation environment.

## Manual and Help publication boundary

`UM-QMS-001` v0.1 remains DRAFT, unpublished, unscheduled, and without an effective date. Reviewed Help content is not automatically published by this candidate designation.

Do not publish either merely because rc.7 is designated or CI succeeds.

## AWS boundary

AWS remains **PLAN-only**.

No AWS foundation/service APPLY is authorized by this candidate designation. Before any APPLY, the explicit cost gate must be presented, current pricing refreshed, governance prerequisites reviewed, and James Ramsey must provide explicit approval.

The historical `0.1.0-rc.6` candidate remains frozen and must not be relabeled or mutated.
