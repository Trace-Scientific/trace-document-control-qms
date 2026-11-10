// Opt-in, disposable-Postgres-only failure-path integration test.
// Never targets Railway. All schema and data changes occur inside ROLLBACK.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertDemoTestDatabase } from "./demo-database-safety.mjs";

const DATABASE_URL = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
const enabled = process.env.RUN_DEMO_SQL_INTEGRATION === "1";
const available = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;
const source = readFileSync(new URL("../sql/demo-one-time-create-inactive.sql", import.meta.url), "utf8")
  .replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");

test("failed audit insertion rolls back the organization and does not leave a tenant", {
  skip: !enabled || !available ? "Requires opt-in and local psql" : false,
}, () => {
  assertDemoTestDatabase(DATABASE_URL);
  const sql = `
BEGIN;
DO $identity$
BEGIN
  IF current_database() <> 'trace_qms_integration_test'
    OR current_user <> 'trace_qms_test' THEN
    RAISE EXCEPTION 'Wrong disposable test database';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Organization" WHERE "loginCode"='trace-demo-lab') THEN
    RAISE EXCEPTION 'Unexpected pre-existing demo tenant';
  END IF;
END
$identity$;
${source}
CREATE FUNCTION pg_temp.reject_demo_audit() RETURNS trigger
LANGUAGE plpgsql AS $trigger$
BEGIN
  IF NEW."action" = 'DEMO_TENANT_PROVISIONED' THEN
    RAISE EXCEPTION 'SIMULATED_AUDIT_FAILURE';
  END IF;
  RETURN NEW;
END
$trigger$;
CREATE TRIGGER demo_audit_failure_integration
BEFORE INSERT ON public."AuditEvent"
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_demo_audit();
DO $verify$
DECLARE failed boolean := false; remaining integer;
BEGIN
  BEGIN
    PERFORM demo_one_time.create_inactive_trace_demo_lab();
  EXCEPTION WHEN raise_exception THEN
    failed := SQLERRM = 'SIMULATED_AUDIT_FAILURE';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Audit failure was not observed'; END IF;
  SELECT count(*) INTO remaining FROM public."Organization" WHERE "loginCode"='trace-demo-lab';
  IF remaining <> 0 THEN RAISE EXCEPTION 'Organization not rolled back'; END IF;
END
$verify$;
ROLLBACK;
SELECT count(*) FROM public."Organization" WHERE "loginCode"='trace-demo-lab';
`;
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", DATABASE_URL.replace("?schema=public", "")], {
    input: sql, encoding: "utf8", timeout: 30000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "3" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /(?:^|\n)0\s*$/);
});
