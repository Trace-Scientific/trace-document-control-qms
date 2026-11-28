export type WorkspaceVisibility = {
  controlledSubmission: boolean;
  approvalOperations: boolean;
  lifecycleOperations: boolean;
  acknowledgments: boolean;
  acknowledgmentDistribution: boolean;
  controlledCopies: boolean;
  membershipAdministration: boolean;
  folderManager: boolean;
  retentionAdministration: boolean;
  recordManagement: boolean;
  recordCreate: boolean;
  recordArchive: boolean;
  recordExport: boolean;
  recordTypeAdministration: boolean;
  personnelManagement: boolean;
  personnelManage: boolean;
  trainingManagement: boolean;
  trainingManage: boolean;
  qualityEventManagement: boolean;
  qualityEventManage: boolean;
  equipmentManagement: boolean;
  equipmentManage: boolean;
  inventoryRead: boolean;
  inventoryManage: boolean;
  reportingManagement: boolean;
  reportingManage: boolean;
  reportingExport: boolean;
};

export function workspaceVisibility(permissionKeys: Iterable<string>): WorkspaceVisibility {
  const permissions = new Set(permissionKeys);
  const has = (key: string) => permissions.has(key);
  return {
    controlledSubmission: has("document.submit") && has("document.review.manage"),
    approvalOperations: has("document.approve"),
    lifecycleOperations:
      has("document.make_effective") || has("document.retire") || has("document.revise"),
    acknowledgments: has("document.acknowledge"),
    acknowledgmentDistribution: has("document.distribute"),
    controlledCopies: has("document.distribute"),
    membershipAdministration: has("administration.manage"),
    folderManager: has("document.read"),
    retentionAdministration: has("administration.manage"),
    recordManagement: has("record.read"),
    recordCreate: has("record.create"),
    recordArchive: has("record.archive"),
    recordExport: has("record.export"),
    recordTypeAdministration: has("administration.manage"),
    personnelManagement: has("personnel.read"),
    personnelManage: has("personnel.manage"),
    trainingManagement: has("training.read"),
    trainingManage: has("training.manage"),
    qualityEventManagement: has("quality_event.read"),
    qualityEventManage: has("quality_event.manage"),
    equipmentManagement: has("equipment.read"),
    equipmentManage: has("equipment.manage"),
    inventoryRead: has("inventory.read"),
    inventoryManage: has("inventory.manage"),
    reportingManagement: has("report.read"),
    reportingManage: has("report.manage"),
    reportingExport: has("report.export"),
  };
}
