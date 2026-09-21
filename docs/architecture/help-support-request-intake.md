# Help Center End-User Support Request Intake

Status: launch-readiness slice
Baseline: `main` at `6ebce443f4e36657264d8d4da1627bd5b5c77c1c`

## Purpose

Allow authenticated tenant users to submit a support request from Help without granting Trace personnel tenant access and without copying regulated QMS content into the platform control plane.

## Data boundary

The intake record is tenant-scoped and stores:

- organization identifier;
- submitting user identifier;
- subject;
- description entered by the user;
- bounded support category;
- bounded priority;
- optional application version;
- bounded current workspace identifier;
- browser family only;
- optional correlation identifier.

The system does not automatically capture:

- passwords or credentials;
- session tokens;
- raw browser user-agent strings;
- current URL/query string;
- document or record identifiers;
- controlled document text;
- patient information;
- regulated record content;
- Salesforce/provider credentials.

## Separation from controlled support access

A Help support request is an intake record only.

Submitting a request does not create:

- a `SupportAccessRequest`;
- a `SupportAccessApproval`;
- a `SupportSession`;
- any support capability;
- any platform privilege.

If Trace personnel later need tenant access, they must use the existing separately governed case-bound support-access workflow.

## Audit

Submission writes a tenant `AuditEvent` with category, priority, bounded page context, application version, and whether a correlation ID was present.

The support description is not copied into audit metadata.

## User experience

Help now contains a Contact support tab with:

- category;
- priority;
- subject;
- description;
- an explicit warning not to include secrets or regulated content;
- a confirmation after successful submission.

## Follow-on work

Future slices may add:

- Trace-side support intake queue;
- acknowledgement/closure workflow;
- safe support notifications;
- customer-visible request history;
- linkage from an intake record to a separately created controlled support case when access is genuinely required.
