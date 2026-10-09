import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_CODE,
  parseDemoArgs,
  provisionDemoTenant,
} from "./provision-demo-tenant.mjs";

process.env.DATABASE_URL =
  "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

const approvedDatabaseIdentity = async () => [
  {
    database_name: "trace_qms_integration_test",
    database_user: "trace_qms_test",
  },
];

test("dry-run is the default and does not write", async () => {
  let writes = 0;
  const db = {
    $queryRaw: approvedDatabaseIdentity,
    organization: {
      findUnique: async () => null,
      create: async () => {
        writes++;
        throw new Error("Unexpected write");
      },
    },
  };
  const result = await provisionDemoTenant(db, parseDemoArgs([]));
  assert.equal(result.applied, false);
  assert.equal(writes, 0);
});

test("apply requires exact confirmation", () => {
  assert.throws(() => parseDemoArgs(["--apply"]), /confirmation/);
  assert.throws(
    () => parseDemoArgs(["--apply", "--confirm=wrong"]),
    /invalid argument/,
  );
});

test("collision fails closed with no mutation", async () => {
  let writes = 0;
  const db = {
    $queryRaw: approvedDatabaseIdentity,
    organization: {
      findUnique: async () => ({ id: "existing", loginCode: DEMO_CODE }),
      create: async () => {
        writes++;
      },
    },
  };
  await assert.rejects(
    () => provisionDemoTenant(db, { apply: true }),
    /already in use/,
  );
  assert.equal(writes, 0);
});

test("explicit apply creates an inactive tenant with an audit event", async () => {
  let transactions = 0;
  let organizationWrites = 0;
  let auditWrites = 0;

  const db = {
    $queryRaw: approvedDatabaseIdentity,
    organization: {
      findUnique: async () => null,
    },
    $transaction: async (callback) => {
      transactions++;
      return callback({
        organization: {
          create: async ({ data, select }) => {
            organizationWrites++;
            assert.equal(data.loginCode, DEMO_CODE);
            assert.equal(data.active, false);
            assert.deepEqual(select, {
              id: true,
              loginCode: true,
              active: true,
            });
            return { id: "new-demo", loginCode: DEMO_CODE, active: false };
          },
        },
        auditEvent: {
          create: async ({ data }) => {
            auditWrites++;
            assert.equal(data.organizationId, "new-demo");
            assert.equal(data.entityId, "new-demo");
            assert.equal(data.action, "DEMO_TENANT_PROVISIONED");
            assert.equal(data.entityType, "Organization");
            assert.equal(data.metadata.synthetic, true);
            assert.equal(data.metadata.loginCode, DEMO_CODE);
            assert.equal(data.metadata.initialStatus, "INACTIVE");
          },
        },
      });
    },
  };

  const result = await provisionDemoTenant(
    db,
    parseDemoArgs(["--apply", "--confirm=CREATE-SYNTHETIC-DEMO-TENANT"]),
  );

  assert.equal(result.applied, true);
  assert.equal(result.organization.active, false);
  assert.equal(transactions, 1);
  assert.equal(organizationWrites, 1);
  assert.equal(auditWrites, 1);
});

test("audit failure prevents the simulated transaction from committing", async () => {
  let transactionCalls = 0;
  let organizationWrites = 0;
  let auditWrites = 0;
  let committedOrganization = null;
  let rolledBack = false;

  const db = {
    $queryRaw: approvedDatabaseIdentity,
    organization: {
      findUnique: async () => null,
    },
    $transaction: async (callback) => {
      transactionCalls++;
      let pendingOrganization = null;

      try {
        const result = await callback({
          organization: {
            create: async () => {
              organizationWrites++;
              pendingOrganization = {
                id: "new-demo",
                loginCode: DEMO_CODE,
                active: false,
              };
              return pendingOrganization;
            },
          },
          auditEvent: {
            create: async () => {
              auditWrites++;
              throw new Error("Simulated audit write failure");
            },
          },
        });

        committedOrganization = pendingOrganization;
        return result;
      } catch (error) {
        pendingOrganization = null;
        rolledBack = true;
        throw error;
      }
    },
  };

  await assert.rejects(
    () => provisionDemoTenant(db, { apply: true }),
    /Simulated audit write failure/,
  );

  assert.equal(transactionCalls, 1);
  assert.equal(organizationWrites, 1);
  assert.equal(auditWrites, 1);
  assert.equal(rolledBack, true);
  assert.equal(committedOrganization, null);
});

test("unapproved database identity prevents provisioning", async () => {
  let organizationReads = 0;
  let transactions = 0;

  const db = {
    $queryRaw: async () => [
      {
        database_name: "production_database",
        database_user: "production_user",
      },
    ],
    organization: {
      findUnique: async () => {
        organizationReads++;
        throw new Error("Organization lookup must not execute");
      },
    },
    $transaction: async () => {
      transactions++;
      throw new Error("Transaction must not execute");
    },
  };

  await assert.rejects(
    () => provisionDemoTenant(db, { apply: true }),
    /connected PostgreSQL database identity is not approved/,
  );

  assert.equal(organizationReads, 0);
  assert.equal(transactions, 0);
});

test("unapproved database URL prevents all database access", async () => {
  const originalUrl = process.env.DATABASE_URL;
  let queries = 0;

  const db = {
    $queryRaw: async () => {
      queries++;
      throw new Error("Database must not be accessed");
    },
  };

  try {
    process.env.DATABASE_URL =
      "postgresql://example:example@production.example.com:5432/production";

    await assert.rejects(
      () => provisionDemoTenant(db, { apply: true }),
      /connection is not the approved isolated integration-test database/,
    );

    assert.equal(queries, 0);
  } finally {
    process.env.DATABASE_URL = originalUrl;
  }
});
