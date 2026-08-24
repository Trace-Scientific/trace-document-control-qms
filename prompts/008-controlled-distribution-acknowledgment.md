# Prompt 008 — Controlled Distribution and Employee Acknowledgment

## Objective

Assign the exact effective document version to active employees and preserve signed read-and-understand evidence.

## Controls

- distribution requires `document.distribute`
- assignments are tenant-bound and reference one exact effective version
- duplicate recipient/version assignments are rejected
- due dates must be future dates
- authorized distribution managers can report outstanding and overdue assignments
- only the assigned active user can complete an assignment
- completion requires fresh password reauthentication and explicit acknowledgment meaning
- assignment, signature, authentication, completion, and audit evidence commit atomically
- superseded content cannot be newly acknowledged
- assignments and completions cannot be repointed or deleted

## Definition of done

Tenant, permission, recipient, version, reauthentication, immutability, duplicate, and overdue behavior are tested. Full CI passes.
