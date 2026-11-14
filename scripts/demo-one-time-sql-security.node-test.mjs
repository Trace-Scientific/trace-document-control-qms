import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../sql/demo-one-time-create-inactive.sql", import.meta.url), "utf8");

test("security review: function has no caller arguments and no grant to execution role", () => {
  assert.match(sql, /CREATE FUNCTION demo_one_time\.create_inactive_trace_demo_lab\(\)/);
  assert.doesNotMatch(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog, pg_temp/);
  assert.match(sql, /REVOKE ALL ON FUNCTION demo_one_time\.create_inactive_trace_demo_lab\(\) FROM PUBLIC/);
  assert.doesNotMatch(sql, /^\s*GRANT\s+/im);
  assert.doesNotMatch(sql, /\bEXECUTE\s+format\s*\(/i);
});
test("security review: target and data are fixed and audit is in same function", () => {
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /INSERT INTO public\."Organization"/);
  assert.match(sql, /INSERT INTO public\."AuditEvent"/);
  assert.match(sql, /"updatedAt"/);
  assert.match(sql, /'trace-demo-lab'/);
  assert.match(sql, /'DEMO_TENANT_PROVISIONED'/);
  assert.match(sql, /'America\/Los_Angeles', false/);
});
