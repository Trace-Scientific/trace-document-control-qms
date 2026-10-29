import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_RAILWAY } from "./railway-demo-identity.mjs";
import { inspectRailwayDemoDatabase, validateDemoDatabaseIdentityRows } from "./railway-demo-db-preflight.mjs";

const identity = { ...DEMO_RAILWAY, deploymentTier: "demo" };
const databaseUrl = "postgresql://demo:example@postgres-6qrb.railway.internal:5432/railway?schema=public";
const row = { database_name: "railway", database_user: "railway", server_address: "10.0.0.2" };

test("rejects invalid live database identity", () => {
  for (const bad of [[], [{ ...row, database_name: "production" }], [{ ...row, database_user: "postgres" }], [{ ...row, server_address: null }]]) {
    assert.throws(() => validateDemoDatabaseIdentityRows(bad));
  }
});

test("read-only preflight checks tenant collision without writing", async () => {
  let queries = 0;
  let lookups = 0;
  const db = {
    $queryRaw: async () => { queries++; return [row]; },
    organization: { findUnique: async () => { lookups++; return null; } },
  };
  const result = await inspectRailwayDemoDatabase({ db, identity, databaseUrl });
  assert.equal(result.canCreate, true);
  assert.equal(result.writesPerformed, 0);
  assert.equal(queries, 1);
  assert.equal(lookups, 1);
});

test("wrong environment fails before querying", async () => {
  let called = false;
  const db = { $queryRaw: async () => { called = true; return [row]; } };
  await assert.rejects(inspectRailwayDemoDatabase({ db, identity: { ...identity, environmentId: "production" }, databaseUrl }));
  assert.equal(called, false);
});

test("identity rejection identifies failed field without exposing credentials", () => {
  assert.throws(() => validateDemoDatabaseIdentityRows([{ ...row, database_user: "postgres" }]), /database_user_is_superuser_name/);
  assert.throws(() => validateDemoDatabaseIdentityRows([{ ...row, server_address: null }]), /server_address_unavailable/);
  assert.throws(() => validateDemoDatabaseIdentityRows([{ ...row, database_name: "wrong" }]), /database_name_mismatch/);
});
