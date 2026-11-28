import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { PrismaEquipmentComplianceStore } from "./compliance-store";
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
      expect.objectContaining({ id: equipmentId, activeHoldCount: 2, readyHoldCount: 0, firstReadyHoldId: null, openRecallCount: 1, usable: false }),
    ]);
    await expect(store.workspace(other.organizationId)).resolves.toEqual([
      expect.objectContaining({ id: other.equipmentId, activeHoldCount: 0, readyHoldCount: 0, firstReadyHoldId: null, openRecallCount: 0, usable: true }),
    ]);
  });

  it("keeps a recall open through hold readiness and clearance, then audits closure", async () => {
    const { organizationId, actorId, equipmentId } = await createTenant();
    const other = await createTenant();
    const store = new PrismaEquipmentRecallStore();
    const compliance = new PrismaEquipmentComplianceStore();
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
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, activeHoldCount: 1, readyHoldCount: 0, firstReadyHoldId: null, openRecallCount: 1, usable: false }),
    ]);
    await db.$executeRaw`
      UPDATE "Equipment" SET "calibrationRequired" = true, "calibrationIntervalDays" = 30,
        "nextCalibrationDueAt" = CURRENT_DATE + 30
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${equipmentId}::uuid
    `;
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, activeHoldCount: 1, readyHoldCount: 1, firstReadyHoldId: hold.id, openRecallCount: 1, usable: false }),
    ]);
    await expect(store.close(resolution)).rejects.toThrow("compliance holds remain active");
    await compliance.clearHold({ ...target, holdId: hold.id, reason: "Synthetic hold clearance" });
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, activeHoldCount: 0, readyHoldCount: 0, openRecallCount: 1, usable: false }),
    ]);
    await expect(store.close(resolution)).resolves.toMatchObject({ status: "CLOSED", closureReason: resolution.reason });
    await expect(store.list(organizationId, equipmentId)).resolves.toEqual([
      expect.objectContaining({ id: recall.id, status: "CLOSED", reason: "Synthetic recall", scopeSummary: "Synthetic runs" }),
    ]);
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, usable: true, openRecallCount: 0 }),
    ]);
    const audit = await db.auditEvent.findMany({ where: { organizationId, entityId: equipmentId, action: {
      in: ["EQUIPMENT_RECALL_OPENED", "EQUIPMENT_COMPLIANCE_HOLD_CLEARED", "EQUIPMENT_RECALL_CLOSED"],
    } } });
    expect(audit.map(row => row.action).sort()).toEqual([
      "EQUIPMENT_COMPLIANCE_HOLD_CLEARED", "EQUIPMENT_RECALL_CLOSED", "EQUIPMENT_RECALL_OPENED",
    ]);
  });

  it("checks the corresponding due date for each hold and audits eligible clearance", async () => {
    const { organizationId, actorId, equipmentId } = await createTenant();
    const other = await createTenant();
    await db.$executeRaw`
      INSERT INTO "EquipmentComplianceHold" ("organizationId", "equipmentId", "kind", "dueAt")
      VALUES
        (${organizationId}::uuid, ${equipmentId}::uuid, 'CALIBRATION_OVERDUE', DATE '2026-01-01'),
        (${organizationId}::uuid, ${equipmentId}::uuid, 'MAINTENANCE_OVERDUE', DATE '2026-01-03')
    `;
    const store = new PrismaEquipmentComplianceStore();
    const register = new PrismaEquipmentOperationsStore();
    const initial = await store.listHolds(organizationId, equipmentId);
    expect(initial).toHaveLength(2);
    for (const hold of initial) expect(hold).toMatchObject({ currentDueAt: null, canClear: false });
    await expect(store.listHolds(other.organizationId, equipmentId)).resolves.toEqual([]);

    await db.$executeRaw`
      UPDATE "Equipment" SET "calibrationRequired" = true, "calibrationIntervalDays" = 30,
        "nextCalibrationDueAt" = DATE '2026-01-02', "maintenanceRequired" = true, "maintenanceIntervalDays" = 30,
        "nextMaintenanceDueAt" = DATE '2026-01-03'
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${equipmentId}::uuid
    `;
    const holds = await store.listHolds(organizationId, equipmentId);
    const calibration = holds.find(hold => hold.kind === "CALIBRATION_OVERDUE")!;
    const maintenance = holds.find(hold => hold.kind === "MAINTENANCE_OVERDUE")!;
    expect(calibration).toMatchObject({ canClear: true, currentDueAt: new Date("2026-01-02") });
    expect(maintenance).toMatchObject({ canClear: false, currentDueAt: new Date("2026-01-03") });
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ id: equipmentId, activeHoldCount: 2, readyHoldCount: 1, firstReadyHoldId: calibration.id, usable: false }),
    ]);
    await expect(register.workspace(other.organizationId)).resolves.toEqual([
      expect.objectContaining({ id: other.equipmentId, readyHoldCount: 0, firstReadyHoldId: null }),
    ]);

    const command = { organizationId, equipmentId, actorUserId: actorId, reason: "Synthetic calibration evidence" };
    await expect(store.clearHold({ ...command, holdId: maintenance.id })).rejects.toThrow("does not support clearing this hold");
    await db.$executeRaw`
      UPDATE "Equipment" SET "nextMaintenanceDueAt" = DATE '2026-01-04'
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${equipmentId}::uuid
    `;
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ readyHoldCount: 2, firstReadyHoldId: calibration.id, usable: false }),
    ]);
    await expect(store.clearHold({ ...command, holdId: calibration.id })).resolves.toMatchObject({
      clearedAt: expect.any(Date), clearedByUserId: actorId, clearanceReason: command.reason,
    });
    expect(await store.listHolds(organizationId, equipmentId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: calibration.id, canClear: false, clearedAt: expect.any(Date) }),
      expect.objectContaining({ id: maintenance.id, canClear: true, clearedAt: null }),
    ]));
    await expect(register.workspace(organizationId)).resolves.toEqual([
      expect.objectContaining({ activeHoldCount: 1, readyHoldCount: 1, firstReadyHoldId: maintenance.id, usable: false }),
    ]);
    await expect(db.auditEvent.findMany({ where: {
      organizationId, entityId: equipmentId, action: "EQUIPMENT_COMPLIANCE_HOLD_CLEARED",
    } })).resolves.toEqual([expect.objectContaining({ actorUserId: actorId, reason: command.reason })]);
  });

  it("retains impact assessment details and scopes the resulting quality event number", async () => {
    const { organizationId, actorId, equipmentId } = await createTenant();
    const other = await createTenant();
    const [qualityEvent] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "QualityEvent" ("organizationId", "eventNumber", "type", "severity", "summary", "discoveredAt", "reportedByUserId")
      VALUES (${organizationId}::uuid, 'QE-IMPACT-01', 'EQUIPMENT_FAILURE', 'MEDIUM', 'Synthetic impact', CURRENT_TIMESTAMP, ${actorId}::uuid)
      RETURNING "id"
    `;
    const [hold] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "EquipmentComplianceHold" ("organizationId", "equipmentId", "kind", "dueAt")
      VALUES (${organizationId}::uuid, ${equipmentId}::uuid, 'CALIBRATION_OVERDUE', CURRENT_DATE - 1)
      RETURNING "id"
    `;
    const store = new PrismaEquipmentComplianceStore();
    const assessment = await store.createImpact({
      organizationId, equipmentId, actorUserId: actorId, holdId: hold.id, qualityEventId: qualityEvent.id,
      disposition: "POTENTIAL_IMPACT", scopeSummary: "Synthetic runs", rationale: "Synthetic follow-up needed",
    });

    const [history] = await store.listImpactHistory(organizationId, equipmentId, true);
    expect(history).toEqual({
      id: assessment.id, holdId: hold.id, disposition: "POTENTIAL_IMPACT", scopeSummary: "Synthetic runs",
      rationale: "Synthetic follow-up needed", assessorName: "Synthetic Operator", qualityEventNumber: "QE-IMPACT-01",
      assessedAt: assessment.assessedAt,
    });
    await expect(store.listImpactHistory(organizationId, equipmentId, false)).resolves.toEqual([
      expect.objectContaining({ id: assessment.id, qualityEventNumber: null }),
    ]);
    await expect(store.listImpactHistory(other.organizationId, equipmentId, true)).resolves.toEqual([]);
    await expect(store.listImpactHistory(organizationId, other.equipmentId, true)).resolves.toEqual([]);
  });
});
