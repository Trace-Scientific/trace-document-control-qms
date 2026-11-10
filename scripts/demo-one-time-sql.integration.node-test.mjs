// Integration-only test. Requires local Postgres and psql; never connects to Railway.
// Run after applying Prisma schema to the disposable integration database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertDemoTestDatabase } from "./demo-database-safety.mjs";

const DATABASE_URL = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
const sql = readFileSync(new URL("../sql/demo-one-time-create-inactive.sql", import.meta.url), "utf8");
const available = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;
const enabled = process.env.RUN_DEMO_SQL_INTEGRATION === "1";
const target = DATABASE_URL.replace("?schema=public", "");
function run(script) {
  assertDemoTestDatabase(DATABASE_URL);
  const p = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", target], {
    input: script, encoding: "utf8", timeout: 30000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "3" },
  });
  assert.equal(p.status, 0, `psql failed: ${p.stderr}`);
  return p.stdout;
}
test("SQL routine creates one inactive synthetic tenant and audit atomically, then rejects duplicate", {
  skip: !enabled || !available ? "Requires RUN_DEMO_SQL_INTEGRATION=1 and local psql" : false,
}, () => {
  // No persistent installation or tenant: all DDL/DML are rolled back.
  // Strip only the outer transaction statements from the review-only SQL.
  const source = sql.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
  const output = run(`
BEGIN;
SELECT CASE WHEN current_database() = 'trace_qms_integration_test'
  AND current_user = 'trace_qms_test' THEN 'identity-ok'
  ELSE (1/0)::text END;
${source}
DO $verify$
DECLARE oid uuid; audits integer; active_flag boolean; duplicate_rejected boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public."Organization" WHERE "loginCode" = 'trace-demo-lab')
  THEN RAISE EXCEPTION 'fixture collision'; END IF;
  oid := demo_one_time.create_inactive_trace_demo_lab();
  SELECT active INTO active_flag FROM public."Organization" WHERE id = oid;
  IF active_flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'tenant not inactive'; END IF;
  SELECT count(*) INTO audits FROM public."AuditEvent"
    WHERE "organizationId" = oid AND "entityId" = oid
      AND "action" = 'DEMO_TENANT_PROVISIONED' AND metadata->>'synthetic' = 'true';
  IF audits <> 1 THEN RAISE EXCEPTION 'audit cardinality invalid'; END IF;
  BEGIN
    PERFORM demo_one_time.create_inactive_trace_demo_lab();
  EXCEPTION WHEN raise_exception THEN duplicate_rejected := true;
  END;
  IF NOT duplicate_rejected THEN RAISE EXCEPTION 'duplicate accepted'; END IF;
END
$verify$;
ROLLBACK;
SELECT count(*) FROM public."Organization" WHERE "loginCode" = 'trace-demo-lab';
`);
  assert.match(output, /identity-ok/);
  assert.match(output, /(?:^|\n)0\s*$/);
});
