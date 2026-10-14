// Opt-in PostgreSQL integration checks. Never connect to a production database.
// Run only against a disposable, migrated database named *_integration_test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";

const url = process.env.TRACE_QMS_INTEGRATION_DATABASE_URL;
if (!url) {
  test("commercial proposal PostgreSQL integration (requires isolated database URL)", { skip: true }, () => {});
} else {
  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !databaseName.endsWith("_integration_test")) {
    throw new Error("Refusing PostgreSQL integration tests: database name must end in _integration_test.");
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  const create = async (id, creator) => db.$executeRaw(Prisma.sql`
    INSERT INTO "TraceQmsCommercialProposal"
      ("id", "customerName", "priceVersion", "inputSnapshot", "calculationSnapshot",
       "createdByIdentityId", "updatedAt")
    VALUES (${id}::uuid, 'SYNTHETIC INTEGRATION TEST', 'integration-test',
      '{}'::jsonb, '{}'::jsonb, ${creator}::uuid, CURRENT_TIMESTAMP)
  `);
  const transition = (id, revision, action, actor, failEvent = false) => db.$transaction(async tx => {
    const from = action === "SUBMIT" ? "DRAFT" : "SUBMITTED";
    const to = action === "SUBMIT" ? "SUBMITTED" : "APPROVED";
    const rows = await tx.$queryRaw(Prisma.sql`
      UPDATE "TraceQmsCommercialProposal"
      SET "status" = ${to}, "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}::uuid AND "status" = ${from}
        AND "revision" = ${revision}
        AND (${action} = 'SUBMIT' OR "createdByIdentityId" <> ${actor}::uuid)
      RETURNING "revision"
    `);
    if (rows.length !== 1) return false;
    if (failEvent) throw new Error("synthetic event write failure");
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TraceQmsCommercialProposalEvent"
        ("id", "proposalId", "revision", "action", "fromStatus", "toStatus", "actorIdentityId", "reason")
      VALUES (gen_random_uuid(), ${id}::uuid, ${rows[0].revision},
        ${action}, ${from}, ${to}, ${actor}::uuid, 'Synthetic integration check')
    `);
    return true;
  });
  test("PostgreSQL approval atomicity, stale revisions and separation of duties", async () => {
    const id = randomUUID(), creator = randomUUID(), reviewer = randomUUID();
    try {
      await create(id, creator);
      await assert.rejects(transition(id, 0, "SUBMIT", creator, true), /synthetic event write failure/);
      let state = await db.$queryRaw(Prisma.sql`
        SELECT "status", "revision" FROM "TraceQmsCommercialProposal" WHERE "id" = ${id}::uuid
      `);
      assert.deepEqual(state.map(x => [x.status, x.revision]), [["DRAFT", 0]]);
      assert.equal(await transition(id, 0, "SUBMIT", creator), true);
      assert.equal(await transition(id, 1, "APPROVE", creator), false);
      const outcomes = await Promise.all([
        transition(id, 1, "APPROVE", reviewer),
        transition(id, 1, "APPROVE", reviewer),
      ]);
      assert.deepEqual(outcomes.sort(), [false, true]);
      state = await db.$queryRaw(Prisma.sql`
        SELECT "status", "revision" FROM "TraceQmsCommercialProposal" WHERE "id" = ${id}::uuid
      `);
      assert.deepEqual(state.map(x => [x.status, x.revision]), [["APPROVED", 2]]);
      const events = await db.$queryRaw(Prisma.sql`
        SELECT "revision", "action" FROM "TraceQmsCommercialProposalEvent"
        WHERE "proposalId" = ${id}::uuid ORDER BY "revision"
      `);
      assert.deepEqual(events.map(x => [x.revision, x.action]), [[1, "SUBMIT"], [2, "APPROVE"]]);
      await assert.rejects(db.$executeRaw(Prisma.sql`
        UPDATE "TraceQmsCommercialProposalEvent" SET "reason" = 'tampered'
        WHERE "proposalId" = ${id}::uuid
      `), /append-only/);
      await assert.rejects(db.$executeRaw(Prisma.sql`
        DELETE FROM "TraceQmsCommercialProposalEvent" WHERE "proposalId" = ${id}::uuid
      `), /append-only/);
    } finally {
      // Intentionally retain synthetic rows in this disposable test database:
      // production-style approval events must not be deletable, even by test cleanup.
    }
  });
  test.after(async () => { await db.$disconnect(); });
}
