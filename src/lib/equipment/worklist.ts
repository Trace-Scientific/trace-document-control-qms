import type { EquipmentWorkspaceItem } from "./operations";

export type EquipmentWorklistItem = Omit<EquipmentWorkspaceItem, "nextCalibrationDueAt" | "nextMaintenanceDueAt"> & {
  nextCalibrationDueAt: string | null;
  nextMaintenanceDueAt: string | null;
};

export type EquipmentWorklistView = "all" | "holds" | "clearance-ready" | "recalls" | "unavailable" | "overdue" | "due-soon" | "missing-date";
type ScheduleState = "not-required" | "missing-date" | "overdue" | "due-soon" | "scheduled" | "inactive";

function scheduleState(item: EquipmentWorklistItem, required: boolean, date: string | null, today: string, through: string): ScheduleState {
  if (!required) return "not-required";
  if (item.status !== "ACTIVE") return "inactive";
  if (!date) return "missing-date";
  const day = date.slice(0, 10);
  if (day < today) return "overdue";
  return day <= through ? "due-soon" : "scheduled";
}

export function equipmentWorklist(items: readonly EquipmentWorklistItem[], today: string) {
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 30);
  const through = until.toISOString().slice(0, 10);
  return items.map(item => ({
    item,
    calibration: scheduleState(item, item.calibrationRequired, item.nextCalibrationDueAt, today, through),
    maintenance: scheduleState(item, item.maintenanceRequired, item.nextMaintenanceDueAt, today, through),
  }));
}

export function filterEquipmentWorklist(
  rows: ReturnType<typeof equipmentWorklist>,
  filters: { query: string; view: EquipmentWorklistView; status: string },
) {
  const query = filters.query.trim().toLowerCase();
  return rows.filter(({ item, calibration, maintenance }) => {
    if (filters.status && item.status !== filters.status) return false;
    if (!item.equipmentNumber.toLowerCase().includes(query) && !item.name.toLowerCase().includes(query)) return false;
    switch (filters.view) {
      case "holds": return item.activeHoldCount > 0;
      case "clearance-ready": return item.readyHoldCount > 0;
      case "recalls": return item.openRecallCount > 0;
      case "unavailable": return item.status !== "RETIRED" && !item.usable;
      case "all": return true;
      default: return calibration === filters.view || maintenance === filters.view;
    }
  });
}
