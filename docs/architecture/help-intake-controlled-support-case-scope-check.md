# Help Intake / Controlled Support Case Scope Check

## Included

- Nullable one-to-one SupportCase linkage to HelpSupportRequest.
- Explicit CREATE_SUPPORT_CASE action with required reason.
- Same-tenant CustomerAccount derivation.
- Terminated-customer rejection.
- Deterministic linked case number.
- Trace queue display of linked case number.
- Separate navigation to controlled support access.
- Platform audit evidence.
- Regression tests for data minimization and access separation.

## Explicitly excluded

- No automatic SupportAccessRequest.
- No SupportAccessApproval.
- No SupportSession.
- No tenant impersonation or RBAC changes.
- No automatic copy of customer support description.
- No automatic case creation on acknowledgement, assignment, SLA breach, or customer submission.
- No automatic coupled closure.
- No Salesforce changes.
- No Railway changes.

## Acceptance guardrail

The Help intake record may justify creation of a controlled support case, but the case is only the prerequisite container for the existing privileged-access approval workflow. The linkage itself must never grant tenant access.
