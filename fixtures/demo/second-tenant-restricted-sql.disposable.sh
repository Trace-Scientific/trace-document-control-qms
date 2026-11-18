#!/usr/bin/env bash
# Invoked only by the disposable CI PostgreSQL service.
set -euo pipefail
[[ "${RUN_DEMO_FIXTURE_INTEGRATION:-}" == 1 ]]
[[ "${DEMO_TEST_PG_CONTAINER:-}" =~ ^[0-9a-f]{64}$ ]]
[[ "${DATABASE_URL:-}" == 'postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public' ]]

{
  cat <<'SETUP'
BEGIN;
DO $identity$
BEGIN
  IF pg_catalog.current_database() <> 'trace_qms_integration_test'
     OR current_user <> 'trace_qms_test'
     OR pg_catalog.current_setting('server_version_num')::int / 10000 <> 18
  THEN RAISE EXCEPTION 'Unexpected disposable PostgreSQL identity'; END IF;
END
$identity$;

CREATE ROLE trace_demo_lab_b_owner NOLOGIN NOINHERIT;
CREATE ROLE trace_demo_lab_b_executor NOLOGIN NOINHERIT;
GRANT USAGE ON SCHEMA public TO trace_demo_lab_b_owner;
GRANT SELECT ("loginCode", id),
  INSERT ("loginCode", "legalName", "displayName", "timezone", "active", "updatedAt")
  ON public."Organization" TO trace_demo_lab_b_owner;
GRANT INSERT ("organizationId", "action", "entityType", "entityId", "reason", "metadata")
  ON public."AuditEvent" TO trace_demo_lab_b_owner;
GRANT CREATE ON DATABASE trace_qms_integration_test TO trace_demo_lab_b_owner;
SET LOCAL ROLE trace_demo_lab_b_owner;
SETUP
  sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' sql/demo-one-time-create-inactive-lab-b.sql
  cat <<'VERIFY'
RESET ROLE;
REVOKE CREATE ON DATABASE trace_qms_integration_test FROM trace_demo_lab_b_owner;
GRANT USAGE ON SCHEMA demo_one_time_lab_b TO trace_demo_lab_b_executor;
DO $privileges$
BEGIN
  IF pg_catalog.has_function_privilege(
    'trace_demo_lab_b_executor', 'demo_one_time_lab_b.create_inactive_trace_demo_lab_b()', 'EXECUTE')
    OR pg_catalog.has_any_column_privilege('trace_demo_lab_b_executor', 'public."Organization"', 'INSERT')
    OR pg_catalog.has_any_column_privilege('trace_demo_lab_b_executor', 'public."AuditEvent"', 'INSERT')
    OR pg_catalog.has_table_privilege('trace_demo_lab_b_executor', 'public."Organization"', 'DELETE')
    OR pg_catalog.has_table_privilege('trace_demo_lab_b_executor', 'public."AuditEvent"', 'DELETE')
  THEN RAISE EXCEPTION 'Unexpected privileges before test grant'; END IF;
END
$privileges$;
GRANT EXECUTE ON FUNCTION demo_one_time_lab_b.create_inactive_trace_demo_lab_b() TO trace_demo_lab_b_executor;
SET LOCAL ROLE trace_demo_lab_b_executor;
SELECT demo_one_time_lab_b.create_inactive_trace_demo_lab_b();
DO $replay$
DECLARE refused boolean := false;
BEGIN
  BEGIN
    PERFORM demo_one_time_lab_b.create_inactive_trace_demo_lab_b();
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Demo provisioning rejected: target already exists' THEN RAISE; END IF;
    refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Duplicate invocation succeeded'; END IF;
END
$replay$;
RESET ROLE;
REVOKE EXECUTE ON FUNCTION demo_one_time_lab_b.create_inactive_trace_demo_lab_b() FROM trace_demo_lab_b_executor;
DO $verify$
DECLARE created_id uuid;
BEGIN
  SELECT id INTO STRICT created_id FROM public."Organization"
    WHERE "loginCode" = 'trace-demo-lab-b' AND active = false;

  IF pg_catalog.has_function_privilege(
    'trace_demo_lab_b_executor', 'demo_one_time_lab_b.create_inactive_trace_demo_lab_b()', 'EXECUTE')
    OR (SELECT count(*) FROM public."AuditEvent" WHERE "organizationId" = created_id) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public."AuditEvent"
      WHERE "organizationId" = created_id AND "entityId" = created_id
        AND "actorUserId" IS NULL AND action = 'DEMO_TENANT_PROVISIONED'
        AND metadata->>'loginCode' = 'trace-demo-lab-b' AND metadata->>'synthetic' = 'true'
    )
  THEN RAISE EXCEPTION 'Provisioning evidence or privilege cleanup invalid'; END IF;
END
$verify$;
ROLLBACK;
DO $cleanup$
BEGIN
  IF pg_catalog.to_regnamespace('demo_one_time_lab_b') IS NOT NULL
    OR EXISTS (SELECT 1 FROM public."Organization" WHERE "loginCode" = 'trace-demo-lab-b')
  THEN RAISE EXCEPTION 'Disposable transaction left persistent changes'; END IF;
END
$cleanup$;
SELECT 'PASS: restricted Lab B SQL on migrated PostgreSQL 18';
VERIFY
} | docker exec -i "$DEMO_TEST_PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U trace_qms_test -d trace_qms_integration_test
