import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_RAILWAY } from "./railway-demo-identity.mjs";
import { runRailwayDemoPreflight } from "./railway-demo-preflight.mjs";

const env = {
  RAILWAY_PROJECT_ID: DEMO_RAILWAY.projectId,
  RAILWAY_ENVIRONMENT_ID: DEMO_RAILWAY.environmentId,
  RAILWAY_SERVICE_ID: DEMO_RAILWAY.applicationServiceId,
  DEMO_DATABASE_SERVICE_ID: DEMO_RAILWAY.databaseServiceId,
  RAILWAY_ENVIRONMENT_NAME: "demo",
  DEPLOYMENT_TIER: "demo",
  DATABASE_URL: "postgresql://demo:secret@postgres-6qrb.railway.internal:5432/railway?schema=public",
};

test("refuses bad runtime before constructing a database client", async () => {
  let created = false;
  await assert.rejects(runRailwayDemoPreflight({
    env: { ...env, RAILWAY_ENVIRONMENT_ID: "production" },
    createClient: () => { created = true; },
  }));
  assert.equal(created, false);
});

test("reports synthetic login collision and disconnects without writes", async () => {
  let disconnected = false;
  const db = {
    $queryRaw: async () => [{ database_name: "railway", database_user: "railway", server_address: "10.0.0.2" }],
    organization: { findUnique: async () => ({ id: "synthetic", loginCode: "trace-demo-lab", active: false }) },
    $disconnect: async () => { disconnected = true; },
  };
  const result = await runRailwayDemoPreflight({ env, createClient: () => db });
  assert.equal(result.canCreate, false);
  assert.equal(result.writesPerformed, 0);
  assert.equal(disconnected, true);
});

test("disconnects when database identity is rejected", async () => {
  let disconnected = false;
  const db = {
    $queryRaw: async () => [{ database_name: "production", database_user: "railway", server_address: "10.0.0.2" }],
    $disconnect: async () => { disconnected = true; },
  };
  await assert.rejects(runRailwayDemoPreflight({ env, createClient: () => db }));
  assert.equal(disconnected, true);
});
