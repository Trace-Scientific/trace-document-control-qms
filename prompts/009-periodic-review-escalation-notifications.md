# Prompt 009 — Periodic Review, Escalation, and Notification Foundation

## Goal
Create durable, tenant-isolated periodic review records for effective controlled documents and an idempotent notification outbox for review reminders and overdue escalation.

## Delivered behavior
- Making a document effective requires a positive document-type review interval.
- The effective transition calculates `reviewDueAt` with end-of-month-safe UTC month arithmetic and atomically creates one review task for the exact effective version.
- Authorized quality managers can list outstanding reviews; overdue status is calculated server-side.
- A monitor operation creates idempotent escalation levels at due, seven days overdue, and thirty days overdue.
- Each new escalation atomically appends an escalation record, notification-outbox event, and audit event.
- Authorized reviewers complete a pending review once with a controlled outcome and required rationale.
- Supersession cancels the prior version's pending review; stale or non-current versions cannot be listed, escalated, or completed.
- Completed review and escalation evidence is protected from update and deletion at the database layer.
- Notification delivery is intentionally decoupled through a durable outbox; transport is not implemented in this increment.

## Security and regulatory risks addressed
- Tenant identifiers are required in every lookup and composite foreign key.
- Permission checks are server-side for monitoring, reporting, and completion.
- Unique constraints make scheduling and escalation retries idempotent.
- Consequential completion and escalation actions are auditable and transactional.
- Review completion does not silently revise, retire, approve, or re-sign a controlled document.

## Validation
- Unit tests cover authorization, overdue calculation, idempotency, completion conflicts, and required rationale.
- PostgreSQL integrity tests cover immutable completion evidence and notification deduplication.
- Prisma validation, typecheck, lint, tests, migration deployment, integrity SQL, and production build run in CI.
