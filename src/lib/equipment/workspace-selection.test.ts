import { describe, expect, it } from "vitest";
import { equipmentHoldEvidenceType, findActiveEquipmentHold, initialEquipmentSelection } from "./workspace-selection";

describe("equipment workspace shortcut selection", () => {
  const instruments = [{ id: "first-instrument" }, { id: "requested-instrument" }];

  it("selects the requested instrument even when it is not first", () => {
    expect(initialEquipmentSelection(instruments, "requested-instrument")).toBe("requested-instrument");
  });

  it("never falls back to another instrument after an unavailable shortcut", () => {
    expect(initialEquipmentSelection(instruments, "unavailable-instrument")).toBe("");
    expect(initialEquipmentSelection([], "requested-instrument")).toBe("");
  });

  it("preserves the default selection when opening the standalone controls", () => {
    expect(initialEquipmentSelection(instruments)).toBe("first-instrument");
    expect(initialEquipmentSelection([])).toBe("");
  });
});

describe("equipment hold evidence shortcuts", () => {
  const calibration = { id: "calibration", clearedAt: null };
  const maintenance = { id: "maintenance", clearedAt: null };

  it("opens the matching evidence type for each hold kind", () => {
    expect(equipmentHoldEvidenceType.CALIBRATION_OVERDUE).toBe("CALIBRATED");
    expect(equipmentHoldEvidenceType.MAINTENANCE_OVERDUE).toBe("MAINTENANCE");
  });

  it("returns to the requested active hold even when a different hold appears first", () => {
    expect(findActiveEquipmentHold([maintenance, calibration], calibration.id)).toBe(calibration);
    expect(findActiveEquipmentHold([maintenance, calibration])).toBe(maintenance);
  });

  it("never selects a different hold when the requested hold was cleared or is unavailable", () => {
    expect(findActiveEquipmentHold([maintenance, { ...calibration, clearedAt: "2026-11-27" }], calibration.id)).toBeUndefined();
    expect(findActiveEquipmentHold([maintenance], calibration.id)).toBeUndefined();
  });
});
