import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { PrismaQualityCapaStore } from "./capa-store";

const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const disposableUrl = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

describe.skipIf(!enabled)("CAPA worklist in migrated PostgreSQL", () => {
  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    const [identity] = await db.$queryRaw<{ name: string; username: string }[]>`
      SELECT current_database() AS name, current_user AS username
    `;
    expect(identity).toEqual({ name: "trace_qms_integration_test", username: "trace_qms_test" });
  });

  afterAll(async () => db.$disconnect());

  async function createTenant() {
    const organization = await db.organization.create({
      data: { loginCode: `capa-${randomUUID()}`, legalName: "Synthetic CAPA tenant", displayName: "Synthetic CAPA tenant" },
    });
    const owner = await db.user.create({
      data: { organizationId: organization.id, email: "capa@example.invalid", firstName: "Synthetic", lastName: "Owner" },
    });
    return { organizationId: organization.id, ownerId: owner.id };
  }

  type Tenant = Awaited<ReturnType<typeof createTenant>>;

  async function createEvent({ organizationId, ownerId }: Tenant, eventNumber: string, closed = false) {
    const [event] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "QualityEvent" ("organizationId", "eventNumber", "type", "severity", "status", "summary", "discoveredAt", "reportedByUserId")
      VALUES (${organizationId}::uuid, ${eventNumber}, 'NONCONFORMANCE', 'HIGH',
              ${closed ? "CLOSED" : "VERIFICATION"}::"QualityEventStatus", 'Synthetic event', CURRENT_TIMESTAMP, ${ownerId}::uuid)
      RETURNING "id"
    `;
    return event.id;
  }

  async function createAction({ organizationId, ownerId }: Tenant, eventId: string, description: string, completedAt: Date | null) {
    const [action] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "QualityCapaAction" ("organizationId", "eventId", "actionType", "description", "ownerUserId",
                                       "dueAt", "status", "completedAt", "completionEvidence", "createdByUserId")
      VALUES (${organizationId}::uuid, ${eventId}::uuid, 'CORRECTIVE', ${description}, ${ownerId}::uuid,
              '2026-11-01', ${completedAt ? "COMPLETED" : "OPEN"}::"QualityCapaActionStatus",
              ${completedAt}, ${completedAt ? "Synthetic completion evidence" : null}, ${ownerId}::uuid)
      RETURNING "id"
    `;
    return action.id;
  }

  async function recordCheck({ organizationId, ownerId }: Tenant, eventId: string, actionId: string, result: "PASS" | "FAIL", checkedAt = new Date()) {
    await db.$executeRaw`
      INSERT INTO "QualityEffectivenessCheck" ("organizationId", "eventId", "capaActionId", "result", "evidence", "checkedByUserId", "checkedAt")
      VALUES (${organizationId}::uuid, ${eventId}::uuid, ${actionId}::uuid, ${result}::"QualityEffectivenessResult",
              'Synthetic effectiveness evidence', ${ownerId}::uuid, ${checkedAt})
    `;
  }

  it("lists only pending work from its tenant and follows the closure rule for effectiveness", async () => {
    const store = new PrismaQualityCapaStore();
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventId = await createEvent(tenant, "QE-000001");
    const secondEventId = await createEvent(tenant, "QE-000002");
    const closedEventId = await createEvent(tenant, "QE-000003", true);
    const otherEventId = await createEvent(otherTenant, "QE-000001");
    const open = await createAction(tenant, eventId, "Open action", null);
    const pending = await createAction(tenant, secondEventId, "Pending review", new Date("2026-11-02T00:01:00Z"));
    const failed = await createAction(tenant, secondEventId, "Failed review", new Date("2026-11-03T00:01:00Z"));
    await createAction(tenant, closedEventId, "Closed event action", null);
    const other = await createAction(otherTenant, otherEventId, "Other tenant action", null);
    await recordCheck(tenant, secondEventId, failed, "FAIL");

    const first = await store.listWorklist(tenant.organizationId);
    expect(first.map(item => [item.id, item.stage])).toEqual([
      [open, "OPEN"], [pending, "NEEDS_CHECK"], [failed, "FAILED_CHECK"],
    ]);
    expect(first[1]).toEqual(expect.objectContaining({
      eventId: secondEventId, eventNumber: "QE-000002", eventStatus: "VERIFICATION", ownerUserId: tenant.ownerId,
      ownerName: "Synthetic Owner", dueAt: "2026-11-01", completedAt: "2026-11-02",
    }));
    expect(first[1]).not.toHaveProperty("completionEvidence");
    expect((await store.listWorklist(otherTenant.organizationId)).map(item => item.id)).toEqual([other]);

    await recordCheck(tenant, secondEventId, failed, "PASS");
    await recordCheck(tenant, secondEventId, failed, "FAIL");
    expect((await store.listWorklist(tenant.organizationId)).map(item => item.id)).toEqual([open, pending]);
  });

  it("returns all recorded checks newest first only for the requested event and tenant", async () => {
    const store = new PrismaQualityCapaStore();
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventId = await createEvent(tenant, "QE-000001");
    const secondEventId = await createEvent(tenant, "QE-000002");
    const completedAt = new Date("2026-11-01T10:30:00Z");
    const action = await createAction(tenant, eventId, "Reviewed action", completedAt);
    const otherAction = await createAction(tenant, secondEventId, "Separate event action", completedAt);
    const failedAt = new Date("2026-11-02T10:30:00Z");
    const passedAt = new Date("2026-11-03T10:30:00Z");

    await recordCheck(tenant, eventId, action, "FAIL", failedAt);
    await recordCheck(tenant, secondEventId, otherAction, "PASS", passedAt);
    await recordCheck(tenant, eventId, action, "PASS", passedAt);

    const history = await store.listEffectivenessHistory(tenant.organizationId, eventId);
    expect(history).toEqual([
      expect.objectContaining({
        capaActionId: action, result: "PASS", checkedAt: passedAt, checkerName: "Synthetic Owner",
        evidence: "Synthetic effectiveness evidence", evidenceFileId: null,
      }),
      expect.objectContaining({ capaActionId: action, result: "FAIL", checkedAt: failedAt }),
    ]);
    await expect(store.listEffectivenessHistory(otherTenant.organizationId, eventId)).resolves.toEqual([]);
  });
});
