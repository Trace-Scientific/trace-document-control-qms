# UM-QMS-001 Draft Assembly Scope Check

## Included

- Explicit governed assembly endpoint and Platform Administration action.
- `platform.help.manage` authorization.
- Required controlled reason.
- Transaction-level serialization.
- Idempotent canonical manual/section/revision/release assembly.
- First release version `0.1` in DRAFT state.
- Null effective date for unscheduled draft state.
- Database and service publication guard requiring an effective date.
- Service-level effective-date filtering for user-facing manual reads.
- Platform audit and release event evidence.
- Regression tests and architecture documentation.

## Explicitly excluded

- No publication.
- No effective date assignment.
- No ordinary-user visibility for the draft.
- No Railway data mutation during code review.
- No tenant RBAC changes.
- No tenant SOP replacement.
- No Salesforce changes.
- No training acknowledgement automation.

## Acceptance guardrail

The result of this operation is a governed **draft release candidate**, not an effective instruction. Publication and effective dating remain separate controlled actions.
