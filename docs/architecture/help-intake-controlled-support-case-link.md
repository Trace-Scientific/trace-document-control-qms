# Help Intake to Controlled Support Case Linkage

Status: launch-readiness slice
Baseline: `main` at `c00710c567b0198d94b688dcfb405c86a363beea`

## Purpose

Create a governed bridge from a customer Help request to the existing controlled support-access workflow only when Trace determines that tenant access may actually be required.

## Explicit action

Creating a controlled support case is a separate Trace action.

It requires:

- authenticated platform context;
- `platform.support.request`;
- an active Help support request;
- a required reason;
- a CustomerAccount linked to the same tenant organization.

The action is not performed automatically when a customer submits, when Trace acknowledges, or when an SLA becomes overdue.

## One-to-one linkage

`SupportCase.sourceHelpSupportRequestId` is nullable and unique.

This preserves:

- ordinary manually created SupportCase records;
- at most one controlled support case for a given Help intake record;
- direct evidence of which customer intake led to the controlled case.

## Data minimization

The linked controlled case receives:

- target tenant organization;
- linked CustomerAccount;
- deterministic case number;
- customer-entered subject as the case title;
- source Help request identifier.

The customer-entered support description is deliberately not copied into the controlled support case.

## Access separation

Creating or linking the SupportCase does not create:

- `SupportAccessRequest`;
- `SupportAccessApproval`;
- `SupportSession`;
- support capabilities;
- tenant RBAC;
- tenant impersonation.

After the case exists, Trace must still use the existing controlled support-access workspace to request scoped capabilities and duration, obtain approval from a different authorized platform member, and issue a time-bound session.

## Lifecycle separation

Closing the customer Help request does not automatically close the controlled SupportCase, and closing the controlled SupportCase does not rewrite the customer Help request. Each lifecycle retains its own governed evidence.

## Audit

The linkage action writes a PlatformAuditEvent against the HelpSupportRequest containing the linked support-case identifier, case number, target organization, and operator-supplied reason.

## User experience

The Trace support intake queue shows whether a controlled support case exists.

For eligible active requests it exposes:

`Create controlled support case`

After linkage, it exposes the case number and a separate navigation path to the controlled support-access workspace.
