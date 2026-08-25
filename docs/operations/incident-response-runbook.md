# Incident response runbook

## Severity and first response

| Severity | Example | Initial response target |
| --- | --- | --- |
| Critical | Unauthorized access, audit-integrity risk, data loss | Immediately page security and quality owners |
| High | Service unavailable, signatures or approvals blocked | Begin coordinated response within 30 minutes |
| Medium | Delayed notifications or isolated workflow failures | Triage during the support window |

## Containment

1. Open an incident record and preserve timestamps, release SHA, affected tenant,
   request identifiers, and relevant audit-event identifiers.
2. Revoke exposed credentials and sessions; never copy credential values into
   the incident record.
3. For suspected integrity impact, place the service in a write-restricted state
   and preserve database and application-log evidence.
4. Disable the overdue scheduler if repeated calls amplify the incident.
5. Keep tenant information compartmentalized and involve the privacy owner when
   regulated data may be affected.

## Diagnosis and recovery

- Compare `/api/health` with `/api/health/readiness` to separate process health
  from dependency failure.
- Review authentication events, immutable audit events, workflow locks, and
  notification-outbox state using read-only access.
- Roll application traffic back to the prior validated artifact when the current
  release is causal.
- Restore data only through the approved recovery procedure; retain the original
  affected system for investigation.

## Closure

Quality and security owners approve closure after service restoration, impact
assessment, evidence preservation, required notifications, root-cause analysis,
and tracked corrective/preventive actions. Link the incident and deployment
records without embedding secrets or unnecessary personal data.
