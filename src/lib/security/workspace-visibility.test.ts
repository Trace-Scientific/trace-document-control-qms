import { describe, expect, it } from "vitest";
import { workspaceVisibility } from "./workspace-visibility";

describe("workspace visibility", () => {
  it("keeps read-only users on document browsing without management surfaces", () => {
    expect(workspaceVisibility(["document.read"])).toEqual({
      controlledSubmission: false,
      approvalOperations: false,
      lifecycleOperations: false,
      acknowledgments: false,
      acknowledgmentDistribution: false,
      controlledCopies: false,
      membershipAdministration: false,
      folderManager: true,
      retentionAdministration: false,
      recordManagement: false,
      recordCreate: false,
      recordArchive: false,
      recordExport: false,
      recordTypeAdministration: false,
      personnelManagement: false,
      personnelManage: false,
      trainingManagement: false,
      trainingManage: false,
      qualityEventManagement: false,
      qualityEventManage: false,
      equipmentManagement: false,
      equipmentManage: false,
      inventoryRead: false,
      inventoryManage: false,
      reportingManagement: false,
      reportingManage: false,
      reportingExport: false,
    });
  });

  it("shows recipient acknowledgment work without distribution authority", () => {
    const visibility = workspaceVisibility(["document.read", "document.acknowledge"]);
    expect(visibility.acknowledgments).toBe(true);
    expect(visibility.acknowledgmentDistribution).toBe(false);
    expect(visibility.controlledCopies).toBe(false);
  });

  it("shows controlled-copy operations only with document distribution authority", () => {
    expect(workspaceVisibility(["document.read"]).controlledCopies).toBe(false);
    expect(workspaceVisibility(["document.distribute"]).controlledCopies).toBe(true);
  });

  it("requires both submit and review-management authority for controlled submission", () => {
    expect(workspaceVisibility(["document.submit"]).controlledSubmission).toBe(false);
    expect(workspaceVisibility(["document.submit", "document.review.manage"]).controlledSubmission).toBe(true);
  });

  it("shows administrative surfaces only to administration managers", () => {
    const visibility = workspaceVisibility(["administration.manage"]);
    expect(visibility.membershipAdministration).toBe(true);
    expect(visibility.retentionAdministration).toBe(true);
    expect(visibility.recordTypeAdministration).toBe(true);
  });

  it("keeps record browsing, creation, archival, and export independently least-privileged", () => {
    const reader = workspaceVisibility(["record.read"]);
    expect(reader.recordManagement).toBe(true);
    expect(reader.recordCreate).toBe(false);
    expect(reader.recordArchive).toBe(false);
    expect(reader.recordExport).toBe(false);

    const creator = workspaceVisibility(["record.read", "record.create"]);
    expect(creator.recordCreate).toBe(true);
    expect(creator.recordArchive).toBe(false);
    expect(creator.recordExport).toBe(false);

    const archiver = workspaceVisibility(["record.read", "record.archive"]);
    expect(archiver.recordArchive).toBe(true);
    expect(archiver.recordCreate).toBe(false);
    expect(archiver.recordExport).toBe(false);

    const exporter = workspaceVisibility(["record.read", "record.export"]);
    expect(exporter.recordManagement).toBe(true);
    expect(exporter.recordCreate).toBe(false);
    expect(exporter.recordArchive).toBe(false);
    expect(exporter.recordExport).toBe(true);
  });

  it("keeps personnel browsing and management independently least-privileged", () => {
    const reader = workspaceVisibility(["personnel.read"]);
    expect(reader.personnelManagement).toBe(true);
    expect(reader.personnelManage).toBe(false);

    const manager = workspaceVisibility(["personnel.read", "personnel.manage"]);
    expect(manager.personnelManagement).toBe(true);
    expect(manager.personnelManage).toBe(true);

    const manageOnly = workspaceVisibility(["personnel.manage"]);
    expect(manageOnly.personnelManagement).toBe(false);
    expect(manageOnly.personnelManage).toBe(true);
  });

  it("keeps quality-event browsing and mutation independently least-privileged", () => {
    const reader = workspaceVisibility(["quality_event.read"]);
    expect(reader.qualityEventManagement).toBe(true);
    expect(reader.qualityEventManage).toBe(false);
    const manager = workspaceVisibility(["quality_event.read", "quality_event.manage"]);
    expect(manager.qualityEventManagement).toBe(true);
    expect(manager.qualityEventManage).toBe(true);
  });

  it("keeps equipment browsing and mutation independently least-privileged", () => {
    const reader = workspaceVisibility(["equipment.read"]);
    expect(reader.equipmentManagement).toBe(true);
    expect(reader.equipmentManage).toBe(false);
    const manager = workspaceVisibility(["equipment.read", "equipment.manage"]);
    expect(manager.equipmentManagement).toBe(true);
    expect(manager.equipmentManage).toBe(true);
  });

  it("keeps reporting read, finalization, and export independently least-privileged", () => {
    const reader = workspaceVisibility(["report.read"]);
    expect(reader.reportingManagement).toBe(true);
    expect(reader.reportingManage).toBe(false);
    expect(reader.reportingExport).toBe(false);
    const manager = workspaceVisibility(["report.read", "report.manage"]);
    expect(manager.reportingManagement).toBe(true);
    expect(manager.reportingManage).toBe(true);
    expect(manager.reportingExport).toBe(false);
    const exporter = workspaceVisibility(["report.read", "report.export"]);
    expect(exporter.reportingManagement).toBe(true);
    expect(exporter.reportingManage).toBe(false);
    expect(exporter.reportingExport).toBe(true);
  });

  it("keeps inventory workspace access and inventory writes independently permissioned", () => {
    expect(workspaceVisibility(["inventory.read"])).toMatchObject({ inventoryRead: true, inventoryManage: false, equipmentManagement: false });
    expect(workspaceVisibility(["inventory.manage"])).toMatchObject({ inventoryRead: false, inventoryManage: true });
    expect(workspaceVisibility(["inventory.read", "inventory.manage"])).toMatchObject({ inventoryRead: true, inventoryManage: true });
  });
});
