# Trace-Side Help Support Intake Queue

Status: launch-readiness slice
Baseline: `main` at `197c844535b3d8a7828df4e972b4eac466e9cd04`

## Purpose

Give authorized Trace personnel a governed Platform Administration queue for customer Help requests submitted through the QMS, without entering tenant workspaces and without creating controlled support-access sessions.

## Queue behavior

The Platform Administration Support workspace now includes a customer intake queue with filters for:

- OPEN
- ACKNOWLEDGED
- CLOSED
- ALL

Each queue record shows only the support intake data already submitted through Help plus bounded diagnostic metadata.

Trace personnel may:

- acknowledge an OPEN request with a reason;
- close an OPEN or ACKNOWLEDGED request with a reason.

Closed requests are terminal in this slice.

## Authorization

Queue reads and lifecycle actions require `platform.support.request`.

This permission allows Trace-side case/intake administration. It does not itself grant tenant access.

## Separation from controlled tenant support access

The intake queue does not create or issue:

- `SupportAccessRequest`;
- `SupportAccessApproval`;
- `SupportSession`;
- support capabilities;
- tenant RBAC grants.

The UI includes a separate link to the existing controlled support-access workspace if troubleshooting later requires tenant access.

## Audit

Acknowledge and close actions create `PlatformAuditEvent` evidence containing:

- acting platform identity and membership;
- target intake record;
- reason;
- target organization identifier;
- resulting request status.

The customer support description is not duplicated into platform audit metadata.

## Follow-on work

Future slices may add:

- customer-visible request history/status;
- notification on acknowledgement/closure;
- assignment/ownership and SLA tracking;
- linkage between an intake request and a separately created controlled support case.
