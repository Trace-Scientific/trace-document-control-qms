import assert from "node:assert/strict";
import test from "node:test";
import { activateDemoTenant, parseActivationArgs } from "./activate-demo-tenant.mjs";

const originalDatabaseUrl = process.env.DATABASE_URL;
test.after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});
process.env.DATABASE_URL = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
const org = {
  id: "demo-id", loginCode: "trace-demo-lab",
  legalName: "Trace Scientific Demonstration Laboratory - Fictional",
  displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)", active: false,
};
function mock(overrides = {}) {
  const calls = [];
  const db = {
    calls,
    $queryRaw: async () => [{ database_name: "trace_qms_integration_test", database_user: "trace_qms_test" }],
    $transaction: async (callback) => callback(db),
    organization: {
      findUnique: async () => ({ ...org, ...(overrides.org || {}) }),
      updateMany: async (args) => { calls.push(args); return { count: 1 }; },
    },
    user: { count: async () => overrides.users ?? 0 },
    credential: { count: async () => overrides.credentials ?? 0 },
    auditEvent: { create: async (args) => { calls.push({ auditEvent: args }); if (overrides.auditFailure) throw new Error("Simulated audit failure"); return { id: "audit-id" }; } },
  };
  return db;
}
test("activation defaults to read-only and requires confirmation", () => {
  assert.deepEqual(parseActivationArgs([]), { apply: false });
  assert.throws(() => parseActivationArgs(["--apply"]), /confirmation/);
  assert.deepEqual(parseActivationArgs(["--apply", "--confirm=ACTIVATE-SYNTHETIC-DEMO-TENANT"]), { apply: true });
});
test("activation dry-run never updates the database", async () => {
  const db = mock();
  assert.equal((await activateDemoTenant(db)).applied, false);
  assert.equal(db.calls.length, 0);
});
test("activation rejects occupied, active and mismatched tenants", async () => {
  await assert.rejects(activateDemoTenant(mock({ users: 1 }), { apply: true }), /not empty/);
  await assert.rejects(activateDemoTenant(mock({ credentials: 1 }), { apply: true }), /not empty/);
  await assert.rejects(activateDemoTenant(mock({ org: { active: true } }), { apply: true }), /already active/);
  await assert.rejects(activateDemoTenant(mock({ org: { legalName: "Customer" } }), { apply: true }), /expected synthetic/);
});
test("confirmed activation targets only the verified demo organization", async () => {
  const db = mock();
  assert.equal((await activateDemoTenant(db, { apply: true })).applied, true);
  assert.deepEqual(db.calls[0].where, { id: "demo-id", loginCode: "trace-demo-lab", legalName: "Trace Scientific Demonstration Laboratory - Fictional", displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)", active: false });
  assert.equal(db.calls[1].auditEvent.data.action, "DEMO_TENANT_ACTIVATED");
});

test("activation rejects audit-event creation failure", async () => {
  const db = mock({ auditFailure: true });
  await assert.rejects(activateDemoTenant(db, { apply: true }), /Simulated audit failure/);
  assert.equal(db.calls.length, 2);
});
