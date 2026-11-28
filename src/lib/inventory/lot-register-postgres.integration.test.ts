import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import type { AuthorizationContext } from "../security/authorization";
import { InventoryService } from "./inventory";
import { PrismaInventoryStore } from "./inventory-store";
import { InventoryTraceabilityService } from "./inventory-traceability";
import { listReceiptLocations } from "./receipt-location-directory";

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

  it("lists only tenant receipt locations and posts accepted stock to its recorded site and department", async () => {
    const service = new InventoryService(new PrismaInventoryStore());
    const manager = await createContext("inventory.read", "inventory.manage");
    const other = await createContext("inventory.read");
    const { organizationId } = manager;
    const site = await db.site.create({ data: { organizationId, name: "Main lab" } });
    const inactive = await db.site.create({ data: { organizationId, name: "Previous lab", active: false } });
    const otherSite = await db.site.create({ data: { organizationId: other.organizationId, name: "Other tenant site" } });
    const department = await db.department.create({ data: { organizationId, name: "Receiving", siteId: site.id } });
    const inactiveDepartment = await db.department.create({ data: { organizationId, name: "Old receiving", siteId: site.id, active: false } });
    const incorrectDepartment = await db.department.create({ data: { organizationId, name: "Shared facilities" } });
    const directory = await listReceiptLocations(manager);
    expect(directory.sites).toEqual([
      { id: site.id, name: "Main lab", active: true }, { id: inactive.id, name: "Previous lab", active: false },
    ]);
    expect(directory.departments.map(item => item.id)).toEqual([inactiveDepartment.id, department.id, incorrectDepartment.id]);
    await expect(listReceiptLocations(other)).resolves.toMatchObject({ sites: [{ id: otherSite.id }], departments: [] });
    await expect(listReceiptLocations({ ...manager, grants: [{ permission: "inventory.manage", scopeType: "ORGANIZATION", scopeId: null }] }))
      .rejects.toThrow("Access denied");

    const material = await service.createMaterial(manager, { organizationId, materialNumber: "MAT-001", name: "Sample tubes" });
    const receipt = {
      organizationId, materialId: material.id, lotNumber: "L-001", receivedAt: new Date("2026-11-27"),
      quantityReceived: 3, unitOfMeasure: "box", siteId: site.id, departmentId: department.id,
    };
    await expect(service.receiveLot(manager, { ...receipt, siteId: otherSite.id })).rejects.toThrow("Access denied");
    await expect(service.receiveLot(manager, { ...receipt, siteId: inactive.id, departmentId: null })).rejects.toThrow("Access denied");
    await expect(service.receiveLot(manager, { ...receipt, departmentId: incorrectDepartment.id })).rejects.toThrow("Access denied");
    await expect(service.receiveLot(manager, { ...receipt, departmentId: inactiveDepartment.id })).rejects.toThrow("Access denied");
    const lot = await service.receiveLot(manager, receipt);
    expect(lot).toMatchObject({ siteId: site.id, departmentId: department.id, status: "RECEIVED" });
    const audit = await db.auditEvent.findFirst({ where: { organizationId, entityId: lot.id, action: "MATERIAL_LOT_RECEIVED" } });
    expect(audit?.metadata).toMatchObject({ siteId: site.id, departmentId: department.id });
    await expect(service.listBalances(manager, organizationId, lot.id)).resolves.toEqual([]);

    const traceability = new InventoryTraceabilityService();
    const file = await db.fileObject.create({ data: {
      organizationId, storageKey: `synthetic/${randomUUID()}`, originalName: "acceptance.pdf", mimeType: "application/pdf",
      sizeBytes: BigInt(128), sha256: "0".repeat(64), status: "AVAILABLE", uploadedByUserId: manager.userId,
    } });
    const certificate = { organizationId, evidenceFileId: file.id, summary: "Synthetic acceptance evidence" };
    const transition = { organizationId, lotId: lot.id, reason: "Synthetic status review" };
    await expect(service.transitionLot(manager, { ...transition, status: "ACCEPTED" })).rejects.toThrow("acceptance certificate evidence");
    await traceability.createAcceptanceCertificate(manager, { ...certificate, lotId: lot.id });
    await service.transitionLot(manager, { ...transition, status: "ACCEPTED" });
    await service.transitionLot(manager, { ...transition, status: "QUARANTINED" });
    await service.transitionLot(manager, { ...transition, status: "ACCEPTED" });
    const balances = await service.listBalances(manager, organizationId, lot.id);
    expect(balances).toEqual([expect.objectContaining({ siteId: site.id, departmentId: department.id, unitOfMeasure: "box" })]);
    expect(balances[0].quantityOnHand.toString()).toBe("3");
    const unassignedLot = await service.receiveLot(manager, { ...receipt, lotNumber: "L-002", siteId: null, departmentId: null });
    await traceability.createAcceptanceCertificate(manager, { ...certificate, lotId: unassignedLot.id });
    await service.transitionLot(manager, { ...transition, lotId: unassignedLot.id, status: "ACCEPTED" });
    await expect(service.listBalances(manager, organizationId, unassignedLot.id)).resolves.toEqual([
      expect.objectContaining({ siteId: null, departmentId: null, unitOfMeasure: "box" }),
    ]);
  });
});
