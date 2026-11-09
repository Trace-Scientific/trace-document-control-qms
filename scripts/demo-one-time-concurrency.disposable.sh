#!/bin/sh
# Disposable PostgreSQL 18 concurrency and permission integration test.
# Explicit opt-in required; no network database URLs, no Railway credentials.
set -eu
if [ "${RUN_DEMO_DISPOSABLE_CONCURRENCY:-}" != "1" ]; then
  echo "SKIP: set RUN_DEMO_DISPOSABLE_CONCURRENCY=1 for disposable Docker test"
  exit 0
fi
command -v docker >/dev/null
docker info >/dev/null
NAME="trace-demo-concurrency-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=local_disposable_only -e POSTGRES_DB=trace_demo_disposable --network none postgres:18-alpine >/dev/null
ready=0
for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if docker exec "$NAME" pg_isready -U postgres -d trace_demo_disposable >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || { echo "Disposable PostgreSQL did not become ready"; exit 1; }
psql_local() { docker exec -i "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d trace_demo_disposable "$@"; }
psql_local <<'SQL'
CREATE ROLE demo_owner NOLOGIN;
CREATE ROLE demo_executor LOGIN;
CREATE TABLE public."Organization" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "loginCode" text NOT NULL UNIQUE,
  "legalName" text NOT NULL,
  "displayName" text NOT NULL,
  timezone text NOT NULL,
  active boolean NOT NULL,
  "updatedAt" timestamptz NOT NULL
);
CREATE TABLE public."AuditEvent" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES public."Organization"(id),
  action text NOT NULL,
  "entityType" text NOT NULL,
  "entityId" uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
REVOKE ALL ON public."Organization", public."AuditEvent" FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO demo_owner;
GRANT SELECT, INSERT ON public."Organization", public."AuditEvent" TO demo_owner;
SQL
# The reviewed SQL is copied ONLY into this throwaway Docker container.
docker cp sql/demo-one-time-create-inactive.sql "$NAME":/tmp/demo-create.sql
psql_local -f /tmp/demo-create.sql >/dev/null
psql_local <<'SQL'
ALTER FUNCTION demo_one_time.create_inactive_trace_demo_lab() OWNER TO demo_owner;
GRANT USAGE ON SCHEMA demo_one_time TO demo_executor;
DO $$
BEGIN
  IF has_function_privilege('demo_executor','demo_one_time.create_inactive_trace_demo_lab()','EXECUTE')
  THEN RAISE EXCEPTION 'PUBLIC execute was not revoked'; END IF;
  IF has_table_privilege('demo_executor','public."Organization"','INSERT')
  THEN RAISE EXCEPTION 'executor has direct INSERT'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION demo_one_time.create_inactive_trace_demo_lab() TO demo_executor;
SQL
# Two independent sessions invoke concurrently. One must succeed, one must fail.
docker exec "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d trace_demo_disposable -c 'SET ROLE demo_executor; SELECT demo_one_time.create_inactive_trace_demo_lab();' > /tmp/trace-demo-concurrency-a-$$.log 2>&1 &
PID_A=$!
docker exec "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d trace_demo_disposable -c 'SET ROLE demo_executor; SELECT demo_one_time.create_inactive_trace_demo_lab();' > /tmp/trace-demo-concurrency-b-$$.log 2>&1 &
PID_B=$!
A=0; B=0
wait "$PID_A" || A=$?
wait "$PID_B" || B=$?
if [ "$A" -eq 0 ] && [ "$B" -eq 0 ]; then echo "FAIL: both calls succeeded"; exit 1; fi
if [ "$A" -ne 0 ] && [ "$B" -ne 0 ]; then echo "FAIL: both calls failed"; cat /tmp/trace-demo-concurrency-?-$$.log; exit 1; fi
psql_local <<'SQL'
DO $$
DECLARE org_count int; audit_count int; is_active boolean;
BEGIN
 SELECT count(*), bool_or(active) INTO org_count, is_active
 FROM public."Organization" WHERE "loginCode"='trace-demo-lab';
 SELECT count(*) INTO audit_count FROM public."AuditEvent"
 WHERE action='DEMO_TENANT_PROVISIONED'
   AND "organizationId" IN (SELECT id FROM public."Organization" WHERE "loginCode"='trace-demo-lab');
 IF org_count <> 1 OR audit_count <> 1 OR is_active IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Unexpected post-concurrency rows'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION demo_one_time.create_inactive_trace_demo_lab() FROM demo_executor;
DO $$
BEGIN
 IF has_function_privilege('demo_executor','demo_one_time.create_inactive_trace_demo_lab()','EXECUTE')
 THEN RAISE EXCEPTION 'Executor still has EXECUTE after revocation'; END IF;
END $$;
SQL
rm -f /tmp/trace-demo-concurrency-a-$$.log /tmp/trace-demo-concurrency-b-$$.log
echo "PASS: one successful creation, one duplicate rejection, one audit, no direct DML, execute revoked"
