import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  assertDemoTestDatabase,
  assertDemoTestDatabaseIdentity,
} from "./demo-database-safety.mjs";

const TEST_DATABASE_URL =
  "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

test("integration database identity is verified", async () => {
  assertDemoTestDatabase(TEST_DATABASE_URL);

  const db = new PrismaClient({
    datasources: {
      db: { url: TEST_DATABASE_URL },
    },
  });

  try {
    const result = await db.$queryRaw`
      SELECT current_database() AS database_name,
             current_user AS database_user
    `;

    assert.equal(result.length, 1);
    assert.equal(result[0].database_name, "trace_qms_integration_test");
    assert.equal(result[0].database_user, "trace_qms_test");
  } finally {
    await db.$disconnect();
  }
});

test("PostgreSQL rolls back organization creation when audit insertion fails", async () => {
  assertDemoTestDatabase(TEST_DATABASE_URL);

  const db = new PrismaClient({
    datasources: {
      db: { url: TEST_DATABASE_URL },
    },
  });

  const loginCode = `rollback-test-${process.pid}-${Date.now()}`;

  try {
    await assertDemoTestDatabaseIdentity(db);

    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            loginCode,
            legalName: "Synthetic Rollback Test Laboratory",
            displayName: "Synthetic Rollback Test",
            timezone: "America/Los_Angeles",
            active: false,
          },
        });

        throw new Error("SIMULATED_AUDIT_INSERT_FAILURE");
      }),
      /SIMULATED_AUDIT_INSERT_FAILURE/,
    );

    const remaining = await db.organization.findUnique({
      where: { loginCode },
    });

    assert.equal(remaining, null);
  } finally {
    await db.$disconnect();
  }
});

test("organization and audit event roll back together", async () => {
  assertDemoTestDatabase(TEST_DATABASE_URL);

  const db = new PrismaClient({
    datasources: {
      db: { url: TEST_DATABASE_URL },
    },
  });

  const loginCode = `audit-rollback-${process.pid}-${Date.now()}`;
  let organizationId;

  try {
    await assertDemoTestDatabaseIdentity(db);

    await assert.rejects(
      db.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            loginCode,
            legalName: "Synthetic Audit Transaction Test",
            displayName: "Synthetic Audit Transaction Test",
            timezone: "America/Los_Angeles",
            active: false,
          },
        });

        organizationId = organization.id;

        const audit = await tx.auditEvent.create({
          data: {
            organizationId,
            action: "DEMO_TENANT_PROVISIONED",
            entityType: "Organization",
            entityId: organizationId,
            reason: "Synthetic integration test",
            metadata: { synthetic: true, testOnly: true },
          },
        });

        assert.equal(audit.organizationId, organizationId);
        assert.equal(audit.entityId, organizationId);

        throw new Error("ROLLBACK_VERIFIED_AUDIT_TRANSACTION");
      }),
      /ROLLBACK_VERIFIED_AUDIT_TRANSACTION/,
    );

    const organization = await db.organization.findUnique({
      where: { loginCode },
    });

    const auditCount = await db.auditEvent.count({
      where: { organizationId },
    });

    assert.equal(organization, null);
    assert.equal(auditCount, 0);
  } finally {
    await db.$disconnect();
  }
});

test("PostgreSQL rejects duplicate organization login codes", async () => {
  assertDemoTestDatabase(TEST_DATABASE_URL);

  const db = new PrismaClient({
    datasources: {
      db: { url: TEST_DATABASE_URL },
    },
  });

  const loginCode = `duplicate-test-${process.pid}-${Date.now()}`;

  try {
    await assertDemoTestDatabaseIdentity(db);

    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            loginCode,
            legalName: "Synthetic Original Organization",
            displayName: "Synthetic Original",
            active: false,
          },
        });

        await tx.organization.create({
          data: {
            loginCode,
            legalName: "Synthetic Duplicate Organization",
            displayName: "Synthetic Duplicate",
            active: false,
          },
        });
      }),
      (error) => error.code === "P2002",
    );

    const remaining = await db.organization.findUnique({
      where: { loginCode },
    });

    assert.equal(remaining, null);
  } finally {
    await db.$disconnect();
  }
});
