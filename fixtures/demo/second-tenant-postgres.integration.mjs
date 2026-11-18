// This script commits synthetic rows only in the disposable CI database.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  createInactiveIsolationDemoOrganization,
  DEMO_CREATE_CONFIRMATION,
  DEMO_CREATE_LOGIN_CODE,
  ISOLATION_DEMO_CREATE_CONFIRMATION,
  ISOLATION_DEMO_LOGIN_CODE,
} from "../../scripts/railway-demo-create-transaction.mjs";

const databaseUrl = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
assert.equal(process.env.RUN_DEMO_FIXTURE_INTEGRATION, "1", "Explicit integration opt-in required");
assert.ok(process.env.DATABASE_URL === databaseUrl, "Refusing non-disposable database target");
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const authorization = ISOLATION_DEMO_CREATE_CONFIRMATION;
const isolationTenant = { loginCode: ISOLATION_DEMO_LOGIN_CODE };

try {
  const identity = await db.$queryRaw`
    SELECT current_database() AS name, current_user AS username,
           host(inet_server_addr()) AS server_address
  `;
  assert.equal(identity.length, 1);
  assert.equal(identity[0].name, "trace_qms_integration_test");
  assert.equal(identity[0].username, "trace_qms_test");
  assert.ok(identity[0].server_address, "Expected a TCP database connection");

  const original = await db.organization.create({
    data: {
      loginCode: DEMO_CREATE_LOGIN_CODE,
      legalName: "Original Synthetic Lab",
      displayName: "Original Synthetic Lab",
      active: true,
    },
  });

  const organizationCount = await db.organization.count();
  const auditCount = await db.auditEvent.count();
  await assert.rejects(
    createInactiveIsolationDemoOrganization(db, { authorization: DEMO_CREATE_CONFIRMATION }),
    /authorization/,
  );

  // Use the actual Prisma audit insert and make PostgreSQL reject its foreign key.
  const missingOrganizationId = "00000000-0000-4000-8000-000000000001";
  assert.equal(await db.organization.findUnique({ where: { id: missingOrganizationId } }), null);
  const failingAudit = {
    $transaction: (provision) => db.$transaction((tx) =>
      provision({
        organization: tx.organization,
        auditEvent: {
          create: ({ data }) => tx.auditEvent.create({
            data: { ...data, organizationId: missingOrganizationId },
          }),
        },
      })),
  };
  await assert.rejects(
    createInactiveIsolationDemoOrganization(failingAudit, { authorization }),
    { code: "P2003" },
  );
  assert.equal(await db.organization.findUnique({ where: isolationTenant }), null);
  assert.equal(await db.organization.count(), organizationCount);
  assert.equal(await db.auditEvent.count(), auditCount);

  const attempts = await Promise.allSettled([
    createInactiveIsolationDemoOrganization(db, { authorization }),
    createInactiveIsolationDemoOrganization(db, { authorization }),
  ]);
  const committed = attempts.filter((attempt) => attempt.status === "fulfilled");
  const denied = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(committed.length, 1);
  assert.equal(denied.length, 1);
  assert.ok(denied[0].reason.code === "P2002" || /already exists/.test(denied[0].reason.message));
  await assert.rejects(createInactiveIsolationDemoOrganization(db, { authorization }), /already exists/);

  const created = await db.organization.findUniqueOrThrow({ where: isolationTenant });
  assert.equal(created.id, committed[0].value.organization.id);
  assert.equal(created.active, false);
  const audit = await db.auditEvent.findMany({ where: { organizationId: created.id } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "DEMO_TENANT_PROVISIONED");
  assert.equal(audit[0].entityType, "Organization");
  assert.equal(audit[0].entityId, created.id);
  assert.equal(audit[0].actorUserId, null);
  assert.deepEqual(audit[0].metadata, {
    synthetic: true,
    loginCode: ISOLATION_DEMO_LOGIN_CODE,
    provisioningVersion: 1,
    initialStatus: "INACTIVE",
  });
  assert.equal(await db.organization.count(), organizationCount + 1);
  assert.equal(await db.auditEvent.count(), auditCount + 1);
  assert.equal(await db.user.count({ where: { organizationId: created.id } }), 0);
  assert.equal(await db.document.count({ where: { organizationId: created.id } }), 0);
  assert.deepEqual(await db.organization.findUniqueOrThrow({ where: { id: original.id } }), original);
  console.log("PASS: PostgreSQL rollback, concurrent creation, replay rejection and audit persistence");
} finally {
  await db.$disconnect();
}
