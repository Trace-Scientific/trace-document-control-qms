import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const sql = readFileSync(new URL("../sql/demo-one-time-create-inactive.sql", import.meta.url), "utf8");
test("routine is inert repository source, with atomic create and revoke", () => {
  assert.match(sql, /BEGIN;[\s\S]*CREATE OR REPLACE FUNCTION[\s\S]*REVOKE ALL ON FUNCTION[\s\S]*COMMIT;/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog, pg_temp/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /IF EXISTS[\s\S]*"loginCode" = 'trace-demo-lab'/);
  assert.match(sql, /INSERT INTO public\."Organization"/);
  assert.match(sql, /INSERT INTO public\."AuditEvent"/);
  assert.match(sql, /"updatedAt"/);
  assert.match(sql, /'America\/Los_Angeles', false/);
  assert.doesNotMatch(sql, /^\s*GRANT\s+EXECUTE\b/im);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b|\bUPDATE\s+public\./i);
});
test("no caller-provided parameters or dynamic SQL", () => {
  assert.match(sql, /create_inactive_trace_demo_lab\(\)/);
  assert.doesNotMatch(sql, /\bEXECUTE\s+format\s*\(/i);
  assert.doesNotMatch(sql, /\bEXECUTE\s+\w+\s*;/i);
});
