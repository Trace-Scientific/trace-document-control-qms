# Release candidate 0.1.0-rc.8

## Purpose

`0.1.0-rc.8` is the next controlled validation candidate for Trace QMS after the rc.7 CI-admission defect was corrected and the current mainline verification suite was restored to a passing state.

Candidate designation does not mean the software is validated, qualified, approved for regulated production use, or certified against any regulatory or accreditation framework.

## Source baseline

This candidate reconciliation branch was created from controlled `main` at:

`dd4120bba1623588fd13e26455773e3494b5ce58`

The authoritative `0.1.0-rc.8` candidate SHA is the final squash-merge commit produced when this reconciliation pull request is merged into `main`. That exact 40-character SHA must be used for fresh CI/Security evidence and any later protected validation-environment evidence.

## Pre-candidate verification

PR #339 corrected the CI workflow admission defect discovered during rc.7 exact-SHA evidence collection and reconciled stale lint/test expectations to the current implementation.

Before this rc.8 branch was created:

- PR #339 CI and Security passed on its exact head SHA.
- PR #339 merged to signed controlled `main`.
- `main` was verified at `dd4120bba1623588fd13e26455773e3494b5ce58`.
- The repository had 0 open pull requests and 0 open issues.

## Release identity reconciliation

For `0.1.0-rc.8`:

- `package.json` and root `package-lock.json` identify the same release version.
- Docker application and migration build defaults identify `0.1.0-rc.8`.
- CI production-smoke release identity uses `0.1.0-rc.8`.
- AWS validation service template/documentation defaults identify `0.1.0-rc.8`.
- The protected AWS validation release workflow defaults to `0.1.0-rc.8`.
- The root README identifies rc.8 as the current candidate.
- Historical rc.6 and rc.7 records remain unchanged.

No dependency upgrade, database schema change, or new application feature is intended by this candidate reconciliation.

## Candidate evidence boundary

After merge, the exact final rc.8 SHA requires fresh CI/Security evidence. Prior PR-head, rc.7, or Railway evidence may support development history but must not be substituted for exact-candidate evidence.

The validation requirements and UAT mappings remain planned protocols until executed against the immutable candidate in the approved validation environment.

## Manual and Help publication boundary

`UM-QMS-001` v0.1 remains DRAFT, unpublished, unscheduled, and without an effective date. Reviewed Help content is not automatically published by this candidate designation.

Do not publish either merely because rc.8 is designated or CI succeeds.

## AWS boundary

AWS remains **PLAN-only**.

No AWS foundation/service APPLY is authorized by this candidate designation. Before any APPLY, the explicit cost gate must be presented, current pricing refreshed, governance prerequisites reviewed, and James Ramsey must provide explicit approval.

Historical rc.6 and rc.7 candidates remain frozen and must not be relabeled or mutated.
