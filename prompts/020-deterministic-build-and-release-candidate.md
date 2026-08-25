# Prompt 020 — Deterministic build and first release candidate

## Objective

Close the dependency-reproducibility blocker and assemble traceable automated
evidence for the first controlled release candidate.

## Delivered scope

- Clean Node 22 generation and review of npm lockfile version 3.
- Frozen `npm ci` installation in CI, security audit, and container build.
- Critical-requirement validation traceability matrix.
- Release-candidate `0.1.0-rc.1` identity, evidence expectations, and residual
  external gates.
- Removal of the temporary lockfile-generation workflow from the candidate.

## Acceptance checks

- Manifest/lockfile divergence fails every build path.
- CI and Security workflows pass on the final unchanged head.
- Backup/restore integrity, container build, runtime smoke checks, CodeQL, and
  the production dependency audit remain green.
- The candidate is not represented as a production release before required human
  and validation-environment approvals.
