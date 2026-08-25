# Validation recovery exercise record

## Identification

| Field | Record |
| --- | --- |
| Exercise reference | |
| Candidate SHA/container digest | |
| Source backup identifier and timestamp | |
| Isolated restoration target | |
| Operators and observers | |
| Approved RPO/RTO | |

## Procedure and evidence

1. Confirm the restoration target is isolated and contains no production data.
2. Record backup encryption, access approval, checksum, and retention metadata.
3. Restore using the approved PostgreSQL 17 procedure without overwriting an
   existing database.
4. Apply only approved forward migrations required by the candidate.
5. Run `prisma/tests/integrity.sql` against the restored database.
6. Start the exact candidate artifact and capture readiness evidence.
7. Execute read-only sampling of synthetic controlled documents, workflow tasks,
   signatures, acknowledgments, audit events, and notification state.
8. Record recovery point achieved, recovery duration, errors, deviations, and
   corrective actions.

## Decision

| Decision | Owner | Date/time | Evidence reference |
| --- | --- | --- | --- |
| Recovery integrity accepted/rejected | Quality owner | | |
| RPO achieved/not achieved | Service owner | | |
| RTO achieved/not achieved | Service owner | | |
| Security evidence accepted/rejected | Security owner | | |
