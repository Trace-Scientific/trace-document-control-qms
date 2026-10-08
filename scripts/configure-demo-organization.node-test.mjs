import assert from "node:assert/strict";
import test from "node:test";
import { configureDemoOrganization } from "./configure-demo-organization.mjs";

const mock = (code = "trace-demo-lab", active = true) => ({
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
