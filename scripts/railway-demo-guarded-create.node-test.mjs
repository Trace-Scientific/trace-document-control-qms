import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_RAILWAY } from "./railway-demo-identity.mjs";
import { DEMO_PROVISIONER_SERVICE_ID } from "./railway-demo-provisioning-plan.mjs";
import { prepareGuardedDemoCreation } from "./railway-demo-guarded-create.mjs";

const env = {
  RAILWAY_PROJECT_ID: DEMO_RAILWAY.projectId,
  RAILWAY_ENVIRONMENT_ID: DEMO_RAILWAY.environmentId,
  RAILWAY_ENVIRONMENT_NAME: "demo",
  RAILWAY_SERVICE_ID: DEMO_PROVISIONER_SERVICE_ID,
  DEMO_PROVISIONER_SERVICE_ID,
  DEMO_DATABASE_SERVICE_ID: DEMO_RAILWAY.databaseServiceId,
  DEPLOYMENT_TIER: "demo",
  DATABASE_URL: "postgresql://demo:example@postgres-6qrb.railway.internal:5432/railway?schema=public",
};

function fakeDb(existing = null) {
  const calls = { reads: 0, writes: 0, disconnected: false };
  const db = {
    $queryRaw: async (parts) => {
      calls.reads++;
      if (String(parts[0]).includes("pg_roles")) return [{ database_user: "trace_demo_provisioner", is_superuser: false, can_create_db: false, can_create_role: false, can_replicate: false, bypass_rls: false, transaction_read_only: "on", can_insert_organization: false, can_update_organization: false, can_delete_organization: false, can_insert_audit: false, can_update_audit: false, can_delete_audit: false }];
      return [{ database_name: "railway", database_user: "trace_demo_provisioner", server_address: "10.0.0.1" }];
    },
    organization: { findUnique: async () => { calls.reads++; return existing; } },
    $disconnect: async () => { calls.disconnected = true; },
  };
  return { db, calls };
}
test("prepares inactive synthetic organization without writes", async () => {
  const { db, calls } = fakeDb();
  const result = await prepareGuardedDemoCreation({ env, createClient: () => db });
  assert.equal(result.mode, "READ_ONLY");
  assert.equal(result.plannedActive, false);
  assert.equal(result.applyAvailable, false);
  assert.equal(result.writesPerformed, 0);
  assert.equal(calls.reads, 3);
  assert.equal(result.roleCheck.verifiedReadOnly, true);
  assert.equal(calls.writes, 0);
  assert.equal(calls.disconnected, true);
});
test("refuses existing login code", async () => {
  const { db, calls } = fakeDb({ id: "existing", loginCode: "trace-demo-lab", active: false });
  await assert.rejects(prepareGuardedDemoCreation({ env, createClient: () => db }), /already exists/);
  assert.equal(calls.disconnected, true);
});
for (const options of [
  { apply: true },
  { confirmation: "CREATE-INACTIVE-SYNTHETIC-TRACE-DEMO-LAB" },
  { env: { ...env, RAILWAY_SERVICE_ID: DEMO_RAILWAY.applicationServiceId } },
  { env: { ...env, DEPLOYMENT_TIER: "production" } },
  { env: { ...env, DATABASE_URL: "postgresql://demo:example@production.internal:5432/railway" } },
]) {
  test("rejects unsafe invocation before database connection", async () => {
    let connections = 0;
    await assert.rejects(prepareGuardedDemoCreation({
      env, ...options, createClient: () => { connections++; throw new Error("must not connect"); },
    }));
    assert.equal(connections, 0);
  });
}

test("refuses write-enabled database session before organization lookup", async () => {
  const { db, calls } = fakeDb();
  db.$queryRaw = async () => {
    calls.reads++;
    return [{ database_user: "trace_demo_provisioner", is_superuser: false, can_create_db: false, can_create_role: false, can_replicate: false, bypass_rls: false, transaction_read_only: "off" }];
  };
  await assert.rejects(prepareGuardedDemoCreation({ env, createClient: () => db }), /not approved/);
  assert.equal(calls.reads, 1);
  assert.equal(calls.disconnected, true);
});
