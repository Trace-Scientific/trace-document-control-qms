import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_RAILWAY } from "./railway-demo-identity.mjs";
import { runRailwayDemoPreflight } from "./railway-demo-preflight.mjs";

const env = {
  RAILWAY_PROJECT_ID: DEMO_RAILWAY.projectId,
  RAILWAY_ENVIRONMENT_ID: DEMO_RAILWAY.environmentId,
  RAILWAY_SERVICE_ID: DEMO_RAILWAY.preflightServiceId,
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
    $queryRaw: async (strings) => {
      const query = String(strings[0]);
      if (query.includes("current_database()")) return [{ database_name: "railway", database_user: "railway", server_address: "10.0.0.2" }];
      if (query.includes("FROM pg_index i")) return [];
      if (query.includes("has_schema_privilege(")) return [{
        database_user: "trace_demo_preflight_ro", is_superuser: false, can_create_db: false,
        can_create_role: false, can_replicate: false, bypass_rls: false,
        transaction_read_only: "on", can_create_schema: false, can_select_organization: true,
        can_insert_organization: false, can_update_organization: false, can_delete_organization: false,
        can_insert_audit: false, can_update_audit: false, can_delete_audit: false,
      }];
      if (query.includes("'column'::text")) return ["Organization", "AuditEvent"].flatMap(table_name => [
        { table_name, kind: "column", name: "id", definition: "type=uuid;not_null=true;default=<none>" },
        { table_name, kind: "constraint", name: table_name + "_pkey", definition: "PRIMARY KEY (id)" },
      ]);
      return ["Organization", "AuditEvent"].map(table_name => ({ schema_name: "public", table_name, table_kind: "r", table_owner: "railway", row_security: false, force_row_security: false, trigger_count: 0, policy_count: 0, trigger_definitions: [] }));
    },
    organization: { findUnique: async () => ({ id: "synthetic", loginCode: "trace-demo-lab", active: false }) },
    $disconnect: async () => { disconnected = true; },
  };
  const result = await runRailwayDemoPreflight({ env, createClient: () => db });
  assert.equal(result.canCreate, false);
  assert.equal(result.catalog.tables.length, 2);
  assert.equal(result.structure.tables.length, 2);
  assert.equal(result.structure.writesPerformed, 0);
  assert.equal(result.privileges.verifiedReadOnly, true);
  assert.equal(result.privileges.writesPerformed, 0);
  assert.equal(result.indexes.loginCodeUniquenessVerified, false);
  assert.equal(result.indexes.writesPerformed, 0);
  assert.equal(result.catalog.writesPerformed, 0);
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

test("fails closed and disconnects when catalog inspection is incomplete", async () => {
  let disconnected = false;
  const db = {
    $queryRaw: async (strings) => String(strings[0]).includes("current_database()")
      ? [{ database_name: "railway", database_user: "trace_demo_preflight_ro", server_address: "10.0.0.2" }]
      : [],
    organization: { findUnique: async () => null },
    $disconnect: async () => { disconnected = true; },
  };
  await assert.rejects(runRailwayDemoPreflight({ env, createClient: () => db }), /expected exactly/);
  assert.equal(disconnected, true);
});

test("fails closed and disconnects when structure inspection is incomplete", async () => {
  let disconnected = false;
  const db = {
    $queryRaw: async (strings) => {
      const query = String(strings[0]);
      if (query.includes("current_database()")) return [{ database_name: "railway", database_user: "trace_demo_preflight_ro", server_address: "10.0.0.2" }];
      if (query.includes("'column'::text")) return [];
      return ["Organization", "AuditEvent"].map(table_name => ({ schema_name: "public", table_name, table_kind: "r", table_owner: "postgres", row_security: false, force_row_security: false, trigger_count: 0, policy_count: 0, trigger_definitions: [] }));
    },
    organization: { findUnique: async () => null },
    $disconnect: async () => { disconnected = true; },
  };
  await assert.rejects(runRailwayDemoPreflight({ env, createClient: () => db }), /Demo structure: missing catalog rows/);
  assert.equal(disconnected, true);
});

test("fails closed and disconnects when effective privileges are unsafe", async () => {
  let disconnected = false;
  const db = {
    $queryRaw: async (strings) => {
      const query = String(strings[0]);
      if (query.includes("current_database()")) return [{ database_name: "railway", database_user: "trace_demo_preflight_ro", server_address: "10.0.0.2" }];
      if (query.includes("has_schema_privilege(")) return [{
        database_user: "trace_demo_preflight_ro", is_superuser: false, can_create_db: false,
        can_create_role: false, can_replicate: false, bypass_rls: false,
        transaction_read_only: "on", can_create_schema: true, can_select_organization: true,
        can_insert_organization: false, can_update_organization: false, can_delete_organization: false,
        can_insert_audit: false, can_update_audit: false, can_delete_audit: false,
      }];
      if (query.includes("'column'::text")) return ["Organization", "AuditEvent"].flatMap(table_name => [
        { table_name, kind: "column", name: "id", definition: "type=uuid;not_null=t;default=gen_random_uuid()" },
        { table_name, kind: "constraint", name: table_name + "_pkey", definition: "PRIMARY KEY (id)" },
      ]);
      return ["Organization", "AuditEvent"].map(table_name => ({
        schema_name: "public", table_name, table_kind: "r", table_owner: "postgres",
        row_security: false, force_row_security: false, trigger_count: 0, policy_count: 0, trigger_definitions: [],
      }));
    },
    organization: { findUnique: async () => null },
    $disconnect: async () => { disconnected = true; },
  };
  await assert.rejects(runRailwayDemoPreflight({ env, createClient: () => db }), /not restricted/);
  assert.equal(disconnected, true);
});
