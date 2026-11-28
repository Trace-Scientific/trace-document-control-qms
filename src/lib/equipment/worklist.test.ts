import { describe, expect, it } from "vitest";
import { equipmentWorklist, filterEquipmentWorklist, type EquipmentWorklistItem, type EquipmentWorklistView } from "./worklist";

const today = "2026-11-26";
const fixture: EquipmentWorklistItem = {
  id: "equipment-1", equipmentNumber: "EQ-001", name: "Chemistry analyzer", status: "ACTIVE",
  calibrationRequired: true, maintenanceRequired: false, nextCalibrationDueAt: "2026-11-25T00:00:00Z",
  nextMaintenanceDueAt: null, activeHoldCount: 1, readyHoldCount: 0, firstReadyHoldId: null, openRecallCount: 0, usable: false,
};
const rows = equipmentWorklist([
  fixture,
  { ...fixture, id: "equipment-2", equipmentNumber: "EQ-002", name: "Centrifuge", activeHoldCount: 0,
    nextCalibrationDueAt: today, maintenanceRequired: true, nextMaintenanceDueAt: "2026-12-26", openRecallCount: 1 },
  { ...fixture, id: "equipment-3", equipmentNumber: "EQ-003", name: "Freezer", activeHoldCount: 0,
    nextCalibrationDueAt: null, usable: null },
  { ...fixture, id: "equipment-4", equipmentNumber: "EQ-004", status: "RETIRED", activeHoldCount: 0 },
  { ...fixture, id: "equipment-5", equipmentNumber: "EQ-005", name: "Incubator", activeHoldCount: 0,
    nextCalibrationDueAt: "2026-12-27", usable: true },
], today);

describe("equipment register worklist", () => {
  it("classifies both active schedules and respects today and the 30-day boundary", () => {
    expect(rows.map(({ calibration, maintenance }) => [calibration, maintenance])).toEqual([
      ["overdue", "not-required"], ["due-soon", "due-soon"], ["missing-date", "not-required"],
      ["inactive", "not-required"], ["scheduled", "not-required"],
    ]);
  });

  it.each([
    ["overdue", ["EQ-001"]],
    ["due-soon", ["EQ-002"]],
    ["missing-date", ["EQ-003"]],
    ["holds", ["EQ-001"]],
    ["recalls", ["EQ-002"]],
    ["unavailable", ["EQ-001", "EQ-002", "EQ-003"]],
  ] satisfies [EquipmentWorklistView, string[]][])("filters the %s worklist", (view, expected) => {
    expect(filterEquipmentWorklist(rows, { view, query: "", status: "" }).map(row => row.item.equipmentNumber)).toEqual(expected);
  });

  it("combines query and status with the selected view", () => {
    expect(filterEquipmentWorklist(rows, { view: "holds", query: "  ANALYZER ", status: "ACTIVE" })).toEqual([rows[0]]);
    expect(filterEquipmentWorklist(rows, { view: "holds", query: "eq-001", status: "RETIRED" })).toEqual([]);
    expect(filterEquipmentWorklist(rows, { view: "all", query: "eq-004", status: "RETIRED" })).toEqual([rows[3]]);
  });

  it("finds equipment with a ready hold while preserving the usability decision", () => {
    const ready = { ...fixture, activeHoldCount: 2, readyHoldCount: 1, firstReadyHoldId: "ready-hold" };
    const blocked = { ...fixture, id: "equipment-2", equipmentNumber: "EQ-002", name: "Analyzer with blocked hold" };
    const candidates = equipmentWorklist([ready, blocked], today);
    const filters = { view: "clearance-ready", query: "analyzer", status: "ACTIVE" } as const;

    expect(filterEquipmentWorklist(candidates, filters).map(row => row.item)).toEqual([ready]);
    expect(filterEquipmentWorklist(candidates, { ...filters, query: "EQ-002" })).toEqual([]);
    expect(filterEquipmentWorklist(candidates, { ...filters, status: "RETIRED" })).toEqual([]);
  });
});
