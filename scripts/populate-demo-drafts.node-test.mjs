import assert from "node:assert/strict";
import test from "node:test";
import { populateDemoDrafts } from "./populate-demo-drafts.mjs";

process.env.DATABASE_URL = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

const context = {
  userId: "demo-user", organizationId: "demo-id", userState: "ACTIVE",
  grants: [{ permission: "document.create", scopeType: "ORGANIZATION", scopeId: null }],
};
function db({ loginCode = "trace-demo-lab", active = true, existing = [] } = {}) {
  return {
    $queryRaw: async () => [{ database_name: "trace_qms_integration_test", database_user: "trace_qms_test" }],
    organization: { findUnique: async () => ({ loginCode, active }) },
    documentType: { findMany: async () => [
      { id: "type-sop", code: "SOP" }, { id: "type-pol", code: "POL" },
      { id: "type-wi", code: "WI" }, { id: "type-frm", code: "FRM" },
    ] },
    document: { findMany: async () => existing.map((documentNumber) => ({ documentNumber })) },
  };
}
test("dry run lists documents but does not invoke the governed service", async () => {
  let calls = 0;
  const result = await populateDemoDrafts({ db: db(), context, service: { createDraft: async () => { calls++; } } });
  assert.equal(result.plan.length, 30);
  assert.equal(calls, 0);
});
test("wrong tenant and inactive tenant fail closed", async () => {
  const service = { createDraft: async () => { throw new Error("must not call"); } };
  await assert.rejects(populateDemoDrafts({ db: db({ loginCode: "customer" }), context, service }), /demo organization/);
  await assert.rejects(populateDemoDrafts({ db: db({ active: false }), context, service }), /demo organization/);
});
test("missing document permission fails closed", async () => {
  await assert.rejects(populateDemoDrafts({ db: db(), context: { ...context, grants: [] }, service: {} }), /lacks/);
});
test("existing documents are skipped and new drafts use governed service", async () => {
  const created = [];
  const service = { createDraft: async (_ctx, input) => {
    created.push(input);
    return { id: String(created.length) };
  } };
  const result = await populateDemoDrafts({ db: db({ existing: ["DEMO-SOP-001"] }), context, service, apply: true });
  assert.equal(created.length, 29);
  assert.equal(result.results[0].status, "SKIPPED");
  assert.ok(created.every((entry) => entry.contentText.startsWith("SYNTHETIC DEMONSTRATION ONLY")));
  assert.ok(created.every((entry) => /^[a-f0-9]{64}$/.test(entry.contentHash)));
});

test("demo drafts reject wrong database URL without querying", async () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://user:pass@production.example.com:5432/qms";
    const database = db();
    let queries = 0;
    database.$queryRaw = async () => { queries++; throw new Error("unexpected query"); };
    await assert.rejects(populateDemoDrafts({ db: database, context, service: {}, apply: true }), /not the approved isolated integration-test database/);
    assert.equal(queries, 0);
  } finally {
    process.env.DATABASE_URL = previous;
  }
});

test("demo drafts reject mismatched database identity", async () => {
  const database = db();
  database.$queryRaw = async () => [{ database_name: "customer_db", database_user: "trace_qms_test" }];
  await assert.rejects(populateDemoDrafts({ db: database, context, service: {}, apply: true }), /database identity is not approved/);
});
