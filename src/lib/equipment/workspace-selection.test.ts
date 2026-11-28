import { describe, expect, it } from "vitest";
import { initialEquipmentSelection } from "./workspace-selection";

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
