import assert from "node:assert/strict";
import test from "node:test";
import { createInactiveSyntheticDemoOrganization, DEMO_CREATE_CONFIRMATION } from "./railway-demo-create-transaction.mjs";

function fakeDb({ existing = false, auditFails = false } = {}) {
  const state = { organizations: [], audits: [], committed: false, transactions: 0 };
  const db = {
    $transaction: async (callback) => {
      state.transactions++;
      const pending = { organizations: [], audits: [] };
      const tx = {
        organization: {
          findUnique: async () => existing ? { id: "existing" } : null,
          create: async ({ data }) => {
            const result = { id: "synthetic-id", loginCode: data.loginCode, active: data.active };
            pending.organizations.push(result);
            return result;
          },
        },
        auditEvent: {
          create: async ({ data }) => {
            if (auditFails) throw new Error("simulated audit failure");
            pending.audits.push(data);
          },
        },
      };
      const result = await callback(tx);
      state.organizations.push(...pending.organizations);
      state.audits.push(...pending.audits);
      state.committed = true;
      return result;
    },
  };
  return { db, state };
}
test("refuses missing authorization before any transaction", async () => {
  const { db, state } = fakeDb();
  await assert.rejects(createInactiveSyntheticDemoOrganization(db), /authorization/);
  assert.equal(state.transactions, 0);
});
test("atomically creates only inactive synthetic organization and audit", async () => {
  const { db, state } = fakeDb();
  const result = await createInactiveSyntheticDemoOrganization(db, { authorization: DEMO_CREATE_CONFIRMATION });
  assert.equal(result.organization.active, false);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].organizationId, result.organization.id);
  assert.equal(state.audits[0].metadata.synthetic, true);
});
test("rejects existing login code without any writes", async () => {
  const { db, state } = fakeDb({ existing: true });
  await assert.rejects(createInactiveSyntheticDemoOrganization(db, { authorization: DEMO_CREATE_CONFIRMATION }), /already exists/);
  assert.equal(state.organizations.length, 0);
  assert.equal(state.audits.length, 0);
});
test("audit failure rolls back organization creation", async () => {
  const { db, state } = fakeDb({ auditFails: true });
  await assert.rejects(createInactiveSyntheticDemoOrganization(db, { authorization: DEMO_CREATE_CONFIRMATION }), /audit failure/);
  assert.equal(state.organizations.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.committed, false);
});
