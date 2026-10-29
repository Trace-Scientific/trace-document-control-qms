# Railway demo preflight: restricted database identity

## Confirmed incident

The isolated `trace-qms-demo-preflight` job connected to the demo PostgreSQL service but refused the database identity with `database_user_is_superuser_name`. Its current `DATABASE_URL` references `${{Postgres-6QrB.DATABASE_URL}}`, which resolves to the default database account. **Do not remove the fail-closed check or use production credentials.**

## Proposed remediation (NOT EXECUTED)

1. In the **demo environment only**, have an authorized database administrator create a dedicated login with a newly generated strong password, for example `trace_demo_preflight_ro`. The administrator must verify the connection is to the pinned demo database service before executing any SQL. Never put the password in GitHub, a PR, a chat, or application logs.
2. Execute the following SQL **only after independent confirmation of the demo database endpoint and environment**. Run as an authorized administrator. Replace the password placeholder privately; do not execute the placeholder literally.

```sql
CREATE ROLE trace_demo_preflight_ro LOGIN PASSWORD '<generate-private-strong-password>';
GRANT CONNECT ON DATABASE railway TO trace_demo_preflight_ro;
GRANT USAGE ON SCHEMA public TO trace_demo_preflight_ro;
GRANT SELECT ON TABLE public."Organization" TO trace_demo_preflight_ro;
ALTER ROLE trace_demo_preflight_ro SET default_transaction_read_only = on;
```

3. Verify the role has **no superuser, createdb, createrole, replication or bypassrls attributes**, no membership in privileged roles, no table write privileges, and no broader schema permissions. Check any inherited `PUBLIC` grants and row-level security policies. `default_transaction_read_only` is defense-in-depth, **not a substitute** for restricted grants. Use a read-only role scoped to the minimum required table and catalog metadata.
4. Store the password as a secret in the **demo preflight service only**. Replace that service's `DATABASE_URL` with a URL using the dedicated login and the **same pinned internal host, port and database**. Do not change the demo web app's database credentials or production configuration. Stage and review this change before deployment.
5. Rerun the one-shot preflight and require the logged result to show `mode: READ_ONLY` and `writesPerformed: 0`, with the expected environment and no existing tenant collision. Independently test that an INSERT/UPDATE/DELETE attempt is denied using a safe rollback-only test transaction against a disposable test table; do not write to production or real clinical records.
6. Do not authorize tenant provisioning, public access, or customer demonstrations until separate write-capable provisioning, audit, backup/restore and tenant-isolation gates are reviewed.

## Safety notes

- Railway's connected API cannot execute arbitrary SQL or safely supply a newly generated secret to PostgreSQL. **This runbook is a plan, not evidence that a role exists.**
- Avoid logging full connection URLs, credentials, database records or secrets.
- The preflight's current `current_user != postgres` check is only an identity check, not proof of least privilege; database grants must be verified independently.
