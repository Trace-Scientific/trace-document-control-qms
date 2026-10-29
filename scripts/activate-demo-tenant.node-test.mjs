import assert from "node:assert/strict";
import test from "node:test";
import { activateDemoTenant, parseActivationArgs } from "./activate-demo-tenant.mjs";

const APPROVED_URL = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
process.env.DATABASE_URL = APPROVED_URL;

const org = {
  id: "demo-id", loginCode: "trace-demo-lab",
  legalName: "Trace Scientific Demonstration Laboratory - Fictional",
  displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)", active: false,
};
function mock(overrides = {}) {
  const calls = [];
  return {
    calls,
    $queryRaw: async () => [{ database_name: "trace_qms_integration_test", database_user: "trace_qms_test" }],
    organization: {
      findUnique: async () => ({ ...org, ...(overrides.org || {}) }),
      updateMany: async (args) => { calls.push(args); return { count: 1 }; },
    },
    user: { count: async () => overrides.users ?? 0 },
    credential: { count: async () => overrides.credentials ?? 0 },
  };
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
  assert.deepEqual(db.calls[0].where, { id: "demo-id", loginCode: "trace-demo-lab", active: false });
});

test("activation refuses wrong database URL before reading tenant data", async () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://user:pass@production.example.com:5432/qms";
    const db = mock();
    await assert.rejects(activateDemoTenant(db, { apply: true }), /not the approved isolated integration-test database/);
    assert.equal(db.calls.length, 0);
  } finally {
    process.env.DATABASE_URL = previous;
  }
});

test("activation refuses mismatched database identity", async () => {
  const db = mock();
  db.$queryRaw = async () => [{ database_name: "customer_database", database_user: "trace_qms_test" }];
  await assert.rejects(activateDemoTenant(db, { apply: true }), /database identity is not approved/);
  assert.equal(db.calls.length, 0);
});
