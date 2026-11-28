import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import type { AuthorizationContext } from "../security/authorization";
import { InventoryService } from "./inventory";
import { PrismaInventoryStore } from "./inventory-store";

const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const disposableUrl = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

describe.skipIf(!enabled)("inventory receiving in migrated PostgreSQL", () => {
  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    const [identity] = await db.$queryRaw<{ name: string; username: string }[]>`
      SELECT current_database() AS name, current_user AS username
    `;
    expect(identity).toEqual({ name: "trace_qms_integration_test", username: "trace_qms_test" });
  });
  afterAll(() => db.$disconnect());

  async function createContext(...permissions: string[]): Promise<AuthorizationContext> {
    const organization = await db.organization.create({ data: {
      loginCode: `inventory-${randomUUID()}`, legalName: "Synthetic inventory tenant", displayName: "Synthetic inventory tenant",
    } });
    const user = await db.user.create({ data: {
      organizationId: organization.id, email: "inventory@example.invalid", firstName: "Synthetic", lastName: "Operator",
    } });
    return {
      organizationId: organization.id, userId: user.id, userState: "ACTIVE",
      grants: permissions.map(permission => ({ permission, scopeType: "ORGANIZATION", scopeId: null })),
    };
  }

  it("registers a material and receives a lot without posting inventory or exposing the lot to another tenant", async () => {
    const service = new InventoryService(new PrismaInventoryStore());
    const manager = await createContext("inventory.read", "inventory.manage");
    const other = await createContext("inventory.read");
    const reader = { ...manager, grants: manager.grants.filter(grant => grant.permission === "inventory.read") };
    const { organizationId, userId } = manager;
    const material = await service.createMaterial(manager, { organizationId, materialNumber: "MAT-001", name: "Sample tubes" });
    const receipt = {
      organizationId, materialId: material.id, lotNumber: "L-001", unitOfMeasure: "box", quantityReceived: 2.5,
      receivedAt: new Date("2026-11-27"), expirationDate: new Date("2027-11-27"),
    };
    expect(() => service.receiveLot(reader, receipt)).toThrow("Access denied");
    const lot = await service.receiveLot(manager, receipt);
    expect(lot).toMatchObject({ status: "RECEIVED", receiptPostedAt: null });
    expect(lot.quantityReceived?.toString()).toBe("2.5");
    await expect(service.listBalances(manager, organizationId, lot.id)).resolves.toEqual([]);
    await expect(service.listMaterials(reader, organizationId)).resolves.toEqual([expect.objectContaining({ id: material.id })]);
    await expect(service.listLots(reader, organizationId, material.id)).resolves.toEqual([expect.objectContaining({ id: lot.id })]);
    await expect(service.listLots(other, other.organizationId, material.id)).resolves.toEqual([]);
    expect(() => service.listLots(other, organizationId)).toThrow("Access denied");
    const audit = await db.auditEvent.findMany({ where: { organizationId, actorUserId: userId, entityId: { in: [material.id, lot.id] } } });
    expect(audit.map(event => event.action).sort()).toEqual(["MATERIAL_CREATED", "MATERIAL_LOT_RECEIVED"]);
  });
});
