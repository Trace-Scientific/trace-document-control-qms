import type { EquipmentComplianceKind } from "./compliance";

/** A shortcut must never redirect to another instrument if its target is unavailable. */
export function initialEquipmentSelection(items: readonly { id: string }[], requestedId?: string) {
  if (requestedId) return items.some(item => item.id === requestedId) ? requestedId : "";
  return items[0]?.id ?? "";
}

export type EquipmentEvidenceType = "CALIBRATED" | "MAINTENANCE";

export const equipmentHoldEvidenceType: Record<EquipmentComplianceKind, EquipmentEvidenceType> = {
  CALIBRATION_OVERDUE: "CALIBRATED",
  MAINTENANCE_OVERDUE: "MAINTENANCE",
};

export function findActiveEquipmentHold<T extends { id: string; clearedAt: string | null }>(
  holds: readonly T[], holdId?: string,
) {
  return holds.find(hold => !hold.clearedAt && (holdId === undefined || hold.id === holdId));
}
