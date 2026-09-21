# Help Support Request Scope Check

## Included

- Tenant-authenticated support request POST API.
- Dedicated tenant-scoped support intake table.
- Category and priority constraints.
- Bounded diagnostic metadata.
- Tenant audit evidence.
- Help Center Contact support form.
- Explicit warning against submitting secrets or regulated content.
- Tests proving the intake path does not create support-access grants or sessions.

## Explicitly excluded

- No automatic tenant impersonation.
- No SupportAccessRequest or SupportSession creation.
- No platform-role changes.
- No credential or token collection.
- No raw URL/user-agent capture.
- No automatic document/record content capture.
- No Salesforce activation.
- No Railway configuration changes.

## Acceptance guardrail

A support request may describe a problem, but it must remain a customer-intake record. Any later Trace access to tenant data requires the existing governed support-access process and its separate approvals.
