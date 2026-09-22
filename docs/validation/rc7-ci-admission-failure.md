# RC.7 exact-SHA CI admission failure and correction

## Event

Release candidate `0.1.0-rc.7` was designated by PR #338 with authoritative merge SHA:

`83c4eaa110e3313f942dcd0f326b018fe53b6c89`

The exact-SHA Security workflow completed successfully as run #740.

The exact-SHA CI workflow created run #2783 but failed at workflow admission with zero jobs created. This is not evidence of a failed application test; the CI job never started.

## Root cause

The `Verify release metadata consistency` step in `.github/workflows/ci.yml` used a YAML plain scalar for its `run:` value while embedding the text:

`Release version mismatch: package=...`

The embedded colon followed by a space can be parsed as YAML mapping syntax. GitHub therefore rejected the workflow before creating the `verify` job.

## Correction

The command is now expressed as a YAML block scalar:

`run: |`

No application code, dependencies, database schema, runtime configuration, release version, or regulated workflow behavior is changed by this correction.

## Candidate disposition

The immutable rc.7 SHA remains historical evidence. Because exact-SHA CI could not execute for rc.7, rc.7 must not be treated as validation-ready.

After this CI correction is merged and verified, designate a new immutable release candidate rather than rewriting or relabeling rc.7.

## Governance boundaries

- AWS remains PLAN-only.
- No AWS APPLY is authorized.
- `UM-QMS-001` remains DRAFT and unpublished.
- Reviewed Help content remains unpublished unless separately governed.
