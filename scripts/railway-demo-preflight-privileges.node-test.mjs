import assert from "node:assert/strict";
import test from "node:test";
import { validateDemoPreflightPrivileges as validate, inspectDemoPreflightPrivileges as inspect } from "./railway-demo-preflight-privileges.mjs";
const valid = () => ({
  database_user: "trace_demo_preflight_ro", is_superuser: false, can_create_db: false,
  can_create_role: false, can_replicate: false, bypass_rls: false,
  transaction_read_only: "on", can_create_schema: false, can_select_organization: true,
  can_insert_organization: false, can_update_organization: false, can_delete_organization: false,
  can_insert_audit: false, can_update_audit: false, can_delete_audit: false,
});
test("accepts only the restricted read-only preflight role", () => {
  assert.equal(validate([valid()]).verifiedReadOnly, true);
});
for (const field of ["is_superuser", "can_create_db", "can_create_role", "can_replicate", "bypass_rls", "can_create_schema", "can_insert_organization", "can_update_organization", "can_delete_organization", "can_insert_audit", "can_update_audit", "can_delete_audit"]) {
  test("rejects unexpected privilege: " + field, () => {
    const row = valid(); row[field] = true;
    assert.throws(() => validate([row]), /not restricted/);
  });
}
test("rejects wrong login or writable transaction", () => {
  assert.throws(() => validate([{ ...valid(), database_user: "postgres" }]), /not restricted/);
  assert.throws(() => validate([{ ...valid(), transaction_read_only: "off" }]), /not restricted/);
});
test("rejects incomplete role inspection", () => {
  assert.throws(() => validate([]), /expected one/);
});
test("inspection runs one read-only query", async () => {
  let queries = 0;
  const result = await inspect({ $queryRaw: async () => { queries++; return [valid()]; } });
  assert.equal(queries, 1);
  assert.equal(result.writesPerformed, 0);
});
