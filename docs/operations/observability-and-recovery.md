# Observability and recovery controls

## Signals

The platform exposes separate liveness and readiness endpoints. Availability
monitoring should alert only after retries and should treat readiness failures as
dependency incidents. Application logs use structured JSON events with sensitive
field names redacted and non-scalar values omitted.

Monitor at minimum:

- readiness availability and latency;
- authentication failure-rate changes without logging credentials;
- notification outbox backlog, retries, and dead letters;
- overdue-monitor workflow failures;
- database connections, storage, replication, and backup age;
- deployment SHA and migration status.

Logs are operational evidence, not the regulated audit trail. Never reconstruct
or replace `AuditEvent` records from application logs.

The reviewed dependency lockfile is mandatory. CI, the production dependency
audit, and the container build use frozen `npm ci` installation and fail when
the manifest and lockfile diverge.

## Alert ownership

Critical availability, security, or integrity alerts page the on-call operations
owner and the designated security/quality owner. Notification backlog and
scheduler failures route to the QMS operations queue. Alerts must include a
request or event identifier, release SHA, timestamp, and tenant identifier only
when access to the alert channel is appropriately restricted.

## Backup validation

CI performs a logical PostgreSQL dump, restores it into a separate database, and
runs the database integrity suite against the restored copy. This confirms tool
compatibility and logical recoverability for every release candidate; it does not
replace encrypted production backups or scheduled recovery exercises.

Production requirements:

- encrypted automated backups with access logging and separate retention;
- point-in-time recovery appropriate to the approved RPO;
- a quarterly isolated restoration exercise;
- captured restore duration, integrity results, operator, source backup, and
  corrective actions;
- no production restore over an existing database.

## Initial objectives

Until the quality and business owners approve stricter values, use a provisional
RPO of 24 hours and RTO of 8 hours. These are planning defaults, not contractual
commitments, and must be reviewed during release certification.
