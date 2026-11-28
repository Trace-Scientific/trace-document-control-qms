/** A shortcut must never redirect to another instrument if its target is unavailable. */
export function initialEquipmentSelection(items: readonly { id: string }[], requestedId?: string) {
  if (requestedId) return items.some(item => item.id === requestedId) ? requestedId : "";
  return items[0]?.id ?? "";
}

export type EquipmentEvidenceType = "CALIBRATED" | "MAINTENANCE";
