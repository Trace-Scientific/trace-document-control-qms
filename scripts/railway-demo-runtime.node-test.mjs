import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_RAILWAY } from "./railway-demo-identity.mjs";
import { attestRailwayDemoRuntime } from "./railway-demo-runtime.mjs";

const env = {
  RAILWAY_PROJECT_ID: DEMO_RAILWAY.projectId,
  RAILWAY_ENVIRONMENT_ID: DEMO_RAILWAY.environmentId,
  RAILWAY_SERVICE_ID: DEMO_RAILWAY.applicationServiceId,
  DEMO_DATABASE_SERVICE_ID: DEMO_RAILWAY.databaseServiceId,
  RAILWAY_ENVIRONMENT_NAME: "demo",
  DEPLOYMENT_TIER: "demo",
  DATABASE_URL: "postgresql://demo:secret@postgres-6qrb.railway.internal:5432/railway?schema=public",
};

test("accepts explicit matching Railway runtime identifiers", () => {
  const result = attestRailwayDemoRuntime(env);
  assert.equal(result.identity.environmentId, DEMO_RAILWAY.environmentId);
});

test("fails closed when identifiers, database or tier are absent or mismatched", () => {
  for (const field of Object.keys(env)) {
    assert.throws(() => attestRailwayDemoRuntime({ ...env, [field]: undefined }), field);
    assert.throws(() => attestRailwayDemoRuntime({ ...env, [field]: "production" }), field);
  }
  assert.throws(() => attestRailwayDemoRuntime({}));
});
