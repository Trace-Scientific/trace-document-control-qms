# Release candidate 0.1.0-rc.9

## Purpose

`0.1.0-rc.9` is the next controlled validation candidate for Trace QMS after the product-wide visual-consistency pass aligned major authenticated pages to the Documents visual system.

Candidate designation does not mean the software is validated, qualified, approved for regulated production use, or certified against any regulatory or accreditation framework.

## Source baseline

This candidate reconciliation branch was created from controlled `main` at:

`28a391ecc4dc3ac68747631d332857edbcf1d8cd`

The authoritative `0.1.0-rc.9` candidate SHA is the final squash-merge commit produced when this reconciliation pull request is merged into `main`. That exact 40-character SHA must be used for fresh CI/Security evidence and any later protected validation-environment evidence.

## Pre-candidate verification

PR #341 standardized the QMS visual language using the Documents page as the baseline. The change was presentation-only and did not intentionally alter regulated workflow logic, permissions, database schema, integrations, release controls, or AWS infrastructure.

Before this rc.9 branch was created:

- PR #341 CI and Security passed on its exact head SHA.
- PR #341 merged to signed controlled `main`.
- `main` was verified at `28a391ecc4dc3ac68747631d332857edbcf1d8cd`.
- The repository had 0 open pull requests and 0 open issues.

## Release identity reconciliation

For `0.1.0-rc.9`:

- `package.json` and root `package-lock.json` identify the same release version.
- Docker application and migration build defaults identify `0.1.0-rc.9`.
- CI production-smoke release identity uses `0.1.0-rc.9`.
- AWS validation service template/documentation defaults identify `0.1.0-rc.9`.
- The protected AWS validation release workflow defaults to `0.1.0-rc.9`.
- The root README identifies rc.9 as the current candidate.
- Historical rc.6, rc.7, and rc.8 records remain unchanged.

No dependency upgrade, database schema change, or new regulated workflow behavior is intended by this candidate reconciliation.

## Candidate evidence boundary

After merge, the exact final rc.9 SHA requires fresh CI/Security evidence. Prior PR-head, rc.8, or Railway evidence may support development history but must not be substituted for exact-candidate evidence.

The validation requirements and UAT mappings remain planned protocols until executed against the immutable candidate in the approved validation environment.

## Manual and Help publication boundary

`UM-QMS-001` v0.1 remains DRAFT, unpublished, unscheduled, and without an effective date. Reviewed Help content is not automatically published by this candidate designation.

## AWS boundary

AWS remains **PLAN-only**.

No AWS foundation/service APPLY is authorized by this candidate designation. Before any APPLY, the explicit cost gate must be presented, current pricing refreshed, governance prerequisites reviewed, and James Ramsey must provide explicit approval.

Historical rc.6, rc.7, and rc.8 candidates remain frozen and must not be relabeled or mutated.
