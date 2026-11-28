import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { PrismaEquipmentRecallStore } from "./recall-store";
import { PrismaEquipmentOperationsStore } from "./operations-store";

const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const disposableUrl = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

describe.skipIf(!enabled)("equipment register in migrated PostgreSQL", () => {
  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    const [identity] = await db.$queryRaw<{ name: string; username: string }[]>`
      SELECT current_database() AS name, current_user AS username
    `;
    expect(identity).toEqual({ name: "trace_qms_integration_test", username: "trace_qms_test" });
  });
  afterAll(async () => db.$disconnect());

  async function createTenant() {
    const organization = await db.organization.create({ data: {
      loginCode: `equipment-${randomUUID()}`, legalName: "Synthetic equipment tenant", displayName: "Synthetic equipment tenant",
    } });
    const actor = await db.user.create({ data: {
      organizationId: organization.id, email: "equipment@example.invalid", firstName: "Synthetic", lastName: "Operator",
    } });
    const [item] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Equipment" ("organizationId", "equipmentNumber", "name", "status", "createdByUserId")
      VALUES (${organization.id}::uuid, 'EQ-001', 'Synthetic analyzer', 'ACTIVE', ${actor.id}::uuid)
      RETURNING "id"
    `;
    return { organizationId: organization.id, actorId: actor.id, equipmentId: item.id };
  }

  it("counts only open recalls and active holds on the tenant's equipment", async () => {
    const { organizationId, actorId, equipmentId } = await createTenant();
    const other = await createTenant();
    await db.$executeRaw`
      INSERT INTO "EquipmentRecall"
        ("organizationId", "equipmentId", "reason", "scopeSummary", "openedByUserId", "status", "closedByUserId", "closedAt", "closureReason")
      VALUES
        (${organizationId}::uuid, ${equipmentId}::uuid, 'Open recall', 'Synthetic scope', ${actorId}::uuid, 'OPEN', NULL, NULL, NULL),
        (${organizationId}::uuid, ${equipmentId}::uuid, 'Prior recall', 'Synthetic scope', ${actorId}::uuid, 'CLOSED',
         ${actorId}::uuid, CURRENT_TIMESTAMP, 'Closed for test')
    `;
    await db.$executeRaw`
      INSERT INTO "EquipmentComplianceHold" ("organizationId", "equipmentId", "kind", "dueAt")
      VALUES
        (${organizationId}::uuid, ${equipmentId}::uuid, 'CALIBRATION_OVERDUE', CURRENT_DATE - 2),
        (${organizationId}::uuid, ${equipmentId}::uuid, 'MAINTENANCE_OVERDUE', CURRENT_DATE - 1)
    `;

    const store = new PrismaEquipmentOperationsStore();
    await expect(store.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, activeHoldCount: 2, openRecallCount: 1, usable: false }),
    ]);
    await expect(store.workspace(other.organizationId)).resolves.toEqual([
      expect.objectContaining({ id: other.equipmentId, activeHoldCount: 0, openRecallCount: 0, usable: true }),
    ]);
  });

  it("connects governed recall operations to register usability and preserves the recall history", async () => {
    const { organizationId, actorId, equipmentId } = await createTenant();
    const other = await createTenant();
    const store = new PrismaEquipmentRecallStore();
    const register = new PrismaEquipmentOperationsStore();
    const target = { organizationId, equipmentId, actorUserId: actorId };
    const recall = await store.open({ ...target, reason: "Synthetic recall", scopeSummary: "Synthetic runs" });
    expect(recall.status).toBe("OPEN");
    await expect(store.list(other.organizationId, equipmentId)).resolves.toEqual([]);
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, usable: false, openRecallCount: 1 }),
    ]);

    const [hold] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "EquipmentComplianceHold" ("organizationId", "equipmentId", "kind", "dueAt")
      VALUES (${organizationId}::uuid, ${equipmentId}::uuid, 'CALIBRATION_OVERDUE', CURRENT_DATE - 1)
      RETURNING "id"
    `;
    const resolution = { ...target, recallId: recall.id, reason: "Synthetic corrective work completed" };
    await expect(store.close(resolution)).rejects.toThrow("compliance holds remain active");
    await db.$executeRaw`
      UPDATE "EquipmentComplianceHold" SET "clearedAt" = CURRENT_TIMESTAMP,
        "clearedByUserId" = ${actorId}::uuid, "clearanceReason" = 'Synthetic resolved hold'
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${hold.id}::uuid
    `;
    await expect(store.close(resolution)).resolves.toMatchObject({ status: "CLOSED", closureReason: resolution.reason });
    await expect(store.list(organizationId, equipmentId)).resolves.toEqual([
      expect.objectContaining({ id: recall.id, status: "CLOSED", reason: "Synthetic recall", scopeSummary: "Synthetic runs" }),
    ]);
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, usable: true, openRecallCount: 0 }),
    ]);
    const audit = await db.auditEvent.findMany({ where: { organizationId, entityId: equipmentId, action: {
      in: ["EQUIPMENT_RECALL_OPENED", "EQUIPMENT_RECALL_CLOSED"],
    } } });
    expect(audit.map(row => row.action).sort()).toEqual(["EQUIPMENT_RECALL_CLOSED", "EQUIPMENT_RECALL_OPENED"]);
  });
});
