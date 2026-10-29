import assert from "node:assert/strict";
import test from "node:test";
import { configureDemoOrganization } from "./configure-demo-organization.mjs";

process.env.DATABASE_URL = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

const mock = (code = "trace-demo-lab", active = true) => ({
  $queryRaw: async () => [{ database_name: "trace_qms_integration_test", database_user: "trace_qms_test" }],
  organization: { findUnique: async () => ({ loginCode: code, active }) },
  site: { findMany: async () => [] },
  department: { findMany: async () => [] },
  documentType: { findMany: async () => [] },
  $transaction: async () => { throw new Error("unexpected transaction"); },
});

test("configuration dry-run plans sites, departments and types without writes", async () => {
  const result = await configureDemoOrganization(mock(), "demo-id");
  assert.equal(result.applied, false);
  assert.equal(result.plan.sites.length, 2);
  assert.equal(result.plan.departments.length, 4);
  assert.equal(result.plan.documentTypes.length, 4);
});

test("configuration refuses non-demo and inactive organizations", async () => {
  await assert.rejects(configureDemoOrganization(mock("customer"), "customer-id"), /refused/);
  await assert.rejects(configureDemoOrganization(mock("trace-demo-lab", false), "demo-id"), /refused/);
});

test("apply is atomic and tenant scoped", async () => {
  const calls = [];
  const tx = {
    organization: { findUnique: async () => ({ loginCode: "trace-demo-lab", active: true }) },
    site: { create: async (x) => calls.push(["site", x.data]) },
    department: { create: async (x) => calls.push(["department", x.data]) },
    documentType: { create: async (x) => calls.push(["documentType", x.data]) },
    auditEvent: { create: async (x) => calls.push(["audit", x.data]) },
  };
  const db = { ...mock(), $transaction: async (fn) => fn(tx) };
  const result = await configureDemoOrganization(db, "demo-id", { apply: true });
  assert.equal(result.applied, true);
  assert.equal(calls.length, 11);
  assert.ok(calls.every(([kind, data]) => kind === "audit" || data.organizationId === "demo-id"));
});

test("configuration refuses unapproved database URL before database access", async () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://user:pass@production.example.com:5432/qms";
    let reads = 0;
    const db = mock();
    db.$queryRaw = async () => { reads++; throw new Error("Unexpected database access"); };
    await assert.rejects(configureDemoOrganization(db, "demo-id", { apply: true }), /not the approved isolated integration-test database/);
    assert.equal(reads, 0);
  } finally {
    process.env.DATABASE_URL = previous;
  }
});

test("configuration refuses unapproved database identity", async () => {
  const db = mock();
  db.$queryRaw = async () => [{ database_name: "customer_db", database_user: "trace_qms_test" }];
  await assert.rejects(configureDemoOrganization(db, "demo-id", { apply: true }), /database identity is not approved/);
});
