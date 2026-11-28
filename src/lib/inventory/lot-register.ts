import type { MaterialLotRecord, MaterialLotStatus, MaterialRecord } from "./inventory";

export type CatalogMaterial = Pick<MaterialRecord, "id" | "materialNumber" | "name" | "manufacturer" | "catalogNumber" | "status">;
export type RegisterLot = Pick<MaterialLotRecord, "id" | "materialId" | "lotNumber" | "status" | "quantityReceived" | "unitOfMeasure"> & {
  receivedAt: string;
  expirationDate: string | null;
};

export const lotStatusLabels: Record<MaterialLotStatus, string> = {
  RECEIVED: "Received",
  ACCEPTED: "Accepted",
  QUARANTINED: "Quarantined",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  RECALLED: "Recalled",
  DEPLETED: "Depleted",
};

export function filterLotRegister(
  lots: readonly RegisterLot[],
  materials: ReadonlyMap<string, CatalogMaterial>,
  filters: { query: string; status: MaterialLotStatus | ""; materialId: string },
) {
  const query = filters.query.trim().toLowerCase();
  return lots.filter(lot => {
    if (filters.status && lot.status !== filters.status) return false;
    if (filters.materialId && lot.materialId !== filters.materialId) return false;
    const material = materials.get(lot.materialId);
    return [lot.lotNumber, material?.materialNumber, material?.name]
      .some(value => value?.toLowerCase().includes(query));
  });
}
