import { describe, expect, it } from "vitest";
import { type CatalogMaterial, type RegisterLot, filterLotRegister } from "./lot-register";

const materials = new Map<string, CatalogMaterial>([
  ["material-1", { id: "material-1", materialNumber: "MAT-101", name: "Sample tubes", manufacturer: null, catalogNumber: null, status: "ACTIVE" }],
  ["material-2", { id: "material-2", materialNumber: "MAT-102", name: "Pipette tips", manufacturer: null, catalogNumber: null, status: "INACTIVE" }],
]);
const received: RegisterLot = {
  id: "lot-1", materialId: "material-1", lotNumber: "TUBES-01", status: "RECEIVED",
  receivedAt: "2026-11-26", expirationDate: null, quantityReceived: "0", unitOfMeasure: "case",
};
const quarantined: RegisterLot = {
  ...received, id: "lot-2", materialId: "material-2", lotNumber: "TIPS-01", status: "QUARANTINED",
};
const lots = [received, quarantined];
const filters = { query: "", status: "", materialId: "" } as const;

describe("inventory lot register", () => {
  it.each(["  tUbEs-01  ", "mat-101", "sample tubes"])("finds a lot by %s", query => {
    expect(filterLotRegister(lots, materials, { ...filters, query })).toEqual([received]);
  });

  it("combines status, material, and search while retaining records for inactive materials", () => {
    expect(filterLotRegister(lots, materials, filters)).toEqual(lots);
    const view = { query: "tips", status: "QUARANTINED", materialId: "material-2" } as const;
    expect(filterLotRegister(lots, materials, view)).toEqual([quarantined]);
    expect(filterLotRegister(lots, materials, { ...view, status: "RECEIVED" })).toEqual([]);
    expect(filterLotRegister(lots, materials, { ...view, materialId: "material-1" })).toEqual([]);
  });
});
