import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_RAILWAY,
  assertRailwayDemoIdentity,
  assertRailwayDemoDatabaseUrl,
} from "./railway-demo-identity.mjs";

const identity = { ...DEMO_RAILWAY, deploymentTier: "demo" };
const url = "postgresql://demo:example@postgres-6qrb.railway.internal:5432/railway?schema=public";

test("accepts only the pinned demo environment", () => {
  assert.equal(assertRailwayDemoIdentity(identity), true);
  for (const field of Object.keys(DEMO_RAILWAY)) {
    assert.throws(() => assertRailwayDemoIdentity({ ...identity, [field]: "production" }));
  }
  assert.throws(() => assertRailwayDemoIdentity({ ...identity, deploymentTier: "production" }));
  assert.throws(() => assertRailwayDemoIdentity(undefined));
});

test("accepts only demo database connection shape", () => {
  assert.equal(assertRailwayDemoDatabaseUrl(url), true);
  for (const candidate of [
    "",
    "not-a-url",
    "postgresql://demo:example@localhost:5432/railway",
    "postgresql://demo:example@postgres-6qrb.railway.internal:5432/production",
    "postgresql://demo:example@postgres-6qrb.railway.internal:5433/railway",
    "postgresql://demo:example@postgres-6qrb.railway.internal:5432/railway?schema=other",
    "postgresql://demo:example@postgres-6qrb.railway.internal:5432/railway?sslmode=disable",
    "postgresql://demo@postgres-6qrb.railway.internal:5432/railway",
  ]) {
    assert.throws(() => assertRailwayDemoDatabaseUrl(candidate));
  }
});
