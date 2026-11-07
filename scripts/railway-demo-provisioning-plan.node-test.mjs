import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_RAILWAY } from "./railway-demo-identity.mjs";
import { planRailwayDemoProvisioning } from "./railway-demo-provisioning-plan.mjs";

const SERVICE_ID = "be0f039a-cfad-46c7-a360-95bf0eeefb8c";
const DATABASE_URL = "postgresql://demo:example@postgres-6qrb.railway.internal:5432/railway?schema=public";

function environment(overrides = {}) {
  return {
    RAILWAY_PROJECT_ID: DEMO_RAILWAY.projectId,
    RAILWAY_ENVIRONMENT_ID: DEMO_RAILWAY.environmentId,
    RAILWAY_ENVIRONMENT_NAME: "demo",
    RAILWAY_SERVICE_ID: SERVICE_ID,
    DEMO_PROVISIONER_SERVICE_ID: SERVICE_ID,
    DEMO_DATABASE_SERVICE_ID: DEMO_RAILWAY.databaseServiceId,
    DEPLOYMENT_TIER: "demo",
    DATABASE_URL,
    ...overrides,
  };
}

const APPROVED_ROLE = {
  database_user: "trace_demo_provisioner",
  is_superuser: false, can_create_db: false, can_create_role: false,
  can_replicate: false, bypass_rls: false, transaction_read_only: "on",
  can_insert_organization: false, can_update_organization: false, can_delete_organization: false,
  can_insert_audit: false, can_update_audit: false, can_delete_audit: false,
};

function fakeClient({ existing = null, role = APPROVED_ROLE } = {}) {
  const calls = { reads: 0, disconnected: false, writes: 0 };
  const db = {
    $queryRaw: async () => {
      calls.reads++;
      return calls.reads === 1 ? [role] : [{ database_name: "railway", database_user: "trace_demo_provisioner", server_address: "10.0.0.1" }];
    },
    organization: {
      findUnique: async ({ where, select }) => {
        calls.reads++;
        assert.deepEqual(where, { loginCode: "trace-demo-lab" });
        assert.deepEqual(select, { id: true, loginCode: true, active: true });
        return existing;
      },
    },
    $disconnect: async () => { calls.disconnected = true; },
  };
  return { db, calls };
}

test("read-only plan for missing demo tenant", async () => {
  const { db, calls } = fakeClient();
  const result = await planRailwayDemoProvisioning({ env: environment(), createClient: () => db });
  assert.equal(result.mode, "READ_ONLY");
  assert.equal(result.canCreate, true);
  assert.equal(result.targetLoginCode, "trace-demo-lab");
  assert.equal(result.plannedOrganizationStatus, "INACTIVE");
  assert.equal(result.applyAvailable, false);
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.usersToCreate, 0);
  assert.equal(result.documentsToCreate, 0);
  assert.equal(calls.reads, 3);
  assert.equal(result.roleCheck.verifiedReadOnly, true);
  assert.equal(calls.writes, 0);
  assert.equal(calls.disconnected, true);
});

test("existing tenant is reported but never modified", async () => {
  const { db, calls } = fakeClient({ existing: { id: "existing", loginCode: "trace-demo-lab", active: false } });
  const result = await planRailwayDemoProvisioning({ env: environment(), createClient: () => db });
  assert.equal(result.canCreate, false);
  assert.equal(result.existingOrganization.loginCode, "trace-demo-lab");
  assert.equal(result.writesPerformed, 0);
  assert.equal(calls.disconnected, true);
});

for (const [label, overrides] of [
  ["production environment", { RAILWAY_ENVIRONMENT_NAME: "production" }],
  ["wrong environment ID", { RAILWAY_ENVIRONMENT_ID: "00000000-0000-0000-0000-000000000000" }],
  ["wrong project ID", { RAILWAY_PROJECT_ID: "00000000-0000-0000-0000-000000000000" }],
  ["wrong database service", { DEMO_DATABASE_SERVICE_ID: "00000000-0000-0000-0000-000000000000" }],
  ["wrong database host", { DATABASE_URL: "postgresql://demo:example@production.internal:5432/railway" }],
  ["wrong service identity", { RAILWAY_SERVICE_ID: "00000000-0000-0000-0000-000000000000" }],
  ["self-approved different service", { RAILWAY_SERVICE_ID: "00000000-0000-0000-0000-000000000000", DEMO_PROVISIONER_SERVICE_ID: "00000000-0000-0000-0000-000000000000" }],
  ["missing approved provisioner ID", { DEMO_PROVISIONER_SERVICE_ID: "" }],
  ["malformed approved provisioner ID", { DEMO_PROVISIONER_SERVICE_ID: "not-a-uuid" }],
  ["wrong deployment tier", { DEPLOYMENT_TIER: "production" }],
]) {
  test("refuses " + label + " before database connection", async () => {
    let connections = 0;
    await assert.rejects(
      planRailwayDemoProvisioning({
        env: environment(overrides),
        createClient: () => { connections++; throw new Error("must not connect"); },
      }),
      /Demo safety|Demo runtime|Demo provisioning/,
    );
    assert.equal(connections, 0);
  });
}

test("disconnects on database preflight error", async () => {
  const { db, calls } = fakeClient();
  db.$queryRaw = async () => { throw new Error("preflight failed"); };
  await assert.rejects(
    planRailwayDemoProvisioning({ env: environment(), createClient: () => db }),
    /preflight failed/,
  );
  assert.equal(calls.disconnected, true);
});

for (const [label, role] of [
  ["wrong database role", { ...APPROVED_ROLE, database_user: "postgres" }],
  ["write-capable role", { ...APPROVED_ROLE, can_insert_organization: true }],
  ["write-enabled session", { ...APPROVED_ROLE, transaction_read_only: "off" }],
]) {
  test("fails closed for " + label + " before tenant lookup", async () => {
    const { db, calls } = fakeClient({ role });
    await assert.rejects(
      planRailwayDemoProvisioning({ env: environment(), createClient: () => db }),
      /database role is not approved/,
    );
    assert.equal(calls.reads, 1);
    assert.equal(calls.writes, 0);
    assert.equal(calls.disconnected, true);
  });
}
