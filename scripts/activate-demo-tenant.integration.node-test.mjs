import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { activateDemoTenant, DEMO_CODE } from "./activate-demo-tenant.mjs";
import { assertDemoTestDatabase, assertDemoTestDatabaseIdentity } from "./demo-database-safety.mjs";

const TEST_DATABASE_URL = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

test("activation rolls back when audit creation fails", async () => {
  assertDemoTestDatabase(TEST_DATABASE_URL);
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const db = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });

  let createdId;
  try {
    await assertDemoTestDatabaseIdentity(db);
    const existing = await db.organization.findUnique({ where: { loginCode: DEMO_CODE } });
    assert.equal(existing, null, "Integration test requires an unused synthetic demo login code");
    const created = await db.organization.create({ data: { loginCode: DEMO_CODE, legalName: "Trace Scientific Demonstration Laboratory - Fictional", displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)", timezone: "America/Los_Angeles", active: false } });
    createdId = created.id;
    const failingDb = new Proxy(db, { get(target, prop) { if (prop === "$transaction") return (callback, options) => target.$transaction((tx) => callback(new Proxy(tx, { get(t, key) { if (key === "auditEvent") return { create: async () => { throw new Error("SIMULATED_AUDIT_INSERT_FAILURE"); } }; return t[key]; } })), options); return target[prop]; } });
    await assert.rejects(activateDemoTenant(failingDb, { apply: true }), /SIMULATED_AUDIT_INSERT_FAILURE/);
    const afterFailure = await db.organization.findUnique({ where: { id: createdId } });
    assert.equal(afterFailure?.active, false, "Failed activation must leave the demo tenant inactive");
    const auditCount = await db.auditEvent.count({ where: { organizationId: createdId, action: "DEMO_TENANT_ACTIVATED" } });
    assert.equal(auditCount, 0, "Failed activation must not commit an activation audit event");
  } finally {
    try {
      if (createdId) {
        try {
          await db.auditEvent.deleteMany({
            where: { organizationId: createdId, action: "DEMO_TENANT_ACTIVATED" },
          });
        } finally {
          await db.organization.deleteMany({
            where: { id: createdId, loginCode: DEMO_CODE },
          });
        }
      }
    } finally {
      try {
        await db.$disconnect();
      } finally {
        if (previousUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousUrl;
      }
    }
  }
});
