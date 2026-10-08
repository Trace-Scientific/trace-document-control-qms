import assert from "node:assert/strict";
import test from "node:test";
import { activateDemoTenant, parseActivationArgs } from "./activate-demo-tenant.mjs";

const org = {
  id: "demo-id", loginCode: "trace-demo-lab",
  legalName: "Trace Scientific Demonstration Laboratory - Fictional",
  displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)", active: false,
};
function mock(overrides = {}) {
  const calls = [];
  return {
    calls,
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
