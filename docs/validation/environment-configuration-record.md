# Validation environment configuration record

Record values by identifier, status, or fingerprint—never secret value.

| Control | Required evidence | Result/reference |
| --- | --- | --- |
| Candidate identity | Version, full Git SHA, container digest, and ECS task revision | |
| HTTPS origin | Approved hostname and certificate validation | |
| Database | PostgreSQL 17, TLS, private connectivity, least-privilege role | |
| Secret storage | Provider secret identifiers for database, cron, and validation session | |
| Network | Ingress/egress rules and administrative access path | |
| Session security | Secure/HttpOnly/SameSite cookie and timeout verification | |
| Scheduler | Manual overdue-monitor success and hourly schedule ownership | |
| Observability | Liveness/readiness monitor, alert routing, log retention/redaction | |
| Backup | Encrypted backup policy, PITR status, last successful backup | |
| Change control | Deployment record, migration output, rollback artifact | |
| Test data | Synthetic-data confirmation and cleanup owner | |

Any missing or failed control blocks release approval unless a documented risk
acceptance is signed by the quality and security owners.
