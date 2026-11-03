import assert from "node:assert/strict";
import test from "node:test";
import { inspectDemoCatalog, validateDemoCatalogInspection } from "./railway-demo-catalog-inspection.mjs";

const rows = ["Organization", "AuditEvent"].map((table_name) => ({
  schema_name: "public", table_name, table_kind: "r",
  table_owner: "demo_owner", row_security: false, force_row_security: false,
  trigger_count: 0, policy_count: 0, trigger_definitions: [],
}));
test("inspects only two approved tables without writes", async () => {
  let reads = 0;
  const result = await inspectDemoCatalog({
    $queryRaw: async () => { reads++; return rows; },
  });
  assert.equal(reads, 1);
  assert.equal(result.mode, "READ_ONLY");
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.tables.length, 2);
});
test("rejects missing or additional catalog tables", () => {
  assert.throws(() => validateDemoCatalogInspection(rows.slice(0, 1)), /exactly/);
  assert.throws(() => validateDemoCatalogInspection([...rows, rows[0]]), /exactly/);
});
test("rejects unexpected table names and schema", () => {
  assert.throws(() => validateDemoCatalogInspection([{ ...rows[0], table_name: "User" }, rows[1]]), /unexpected/);
  assert.throws(() => validateDemoCatalogInspection([{ ...rows[0], schema_name: "other" }, rows[1]]), /invalid/);
});
test("rejects malformed catalog values", () => {
  assert.throws(() => validateDemoCatalogInspection([{ ...rows[0], trigger_count: -1 }, rows[1]]), /invalid/);
  assert.throws(() => validateDemoCatalogInspection([{ ...rows[0], table_owner: "" }, rows[1]]), /invalid/);
});

test("rejects malformed trigger definitions", () => {
  assert.throws(() => validateDemoCatalogInspection([{ ...rows[0], trigger_definitions: [null] }, rows[1]]), /invalid/);
});
