"use client";

import { type Ref, useEffect, useState } from "react";
import { initialEquipmentSelection } from "@/lib/equipment/workspace-selection";
import { EquipmentCompliancePanel } from "./equipment-compliance-panel";

type Item = { id: string; equipmentNumber: string; name: string };

export function EquipmentComplianceWorkspace({ canManage, initialEquipmentId, headingRef }: {
  canManage: boolean;
  initialEquipmentId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const [equipment, setEquipment] = useState<Item[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/equipment/operations", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Equipment compliance workspace unavailable");
        const { data }: { data: { equipment: Item[] } } = await response.json();
        if (controller.signal.aborted) return;
        const selection = initialEquipmentSelection(data.equipment, initialEquipmentId);
        setEquipment(data.equipment);
        setSelected(selection);
        if (initialEquipmentId && !selection) setError("The selected instrument is unavailable. Select another instrument to continue.");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Unable to load equipment compliance workspace.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialEquipmentId]);

  async function refreshRegister() {
    window.dispatchEvent(new CustomEvent("qms:equipment-changed", { detail: { equipmentId: selected } }));
  }

  return <section className="card form-stack equipment-register-style">
    <h3 ref={headingRef} tabIndex={-1}>Equipment compliance controls</h3>
    <p>Review system-created overdue compliance holds, record retrospective impact assessment, and clear holds only after current calibration or maintenance evidence supports release.</p>
    {error && <p className="status-error" role="alert">{error}</p>}
    <div className="admin-form equipment-admin-form">
      <label>Equipment
        <select value={selected} onChange={event => { setSelected(event.target.value); setError(""); }} disabled={loading || !equipment.length}>
          <option value="" disabled>{loading ? "Loading equipment…" : equipment.length ? "Select equipment" : "No equipment available"}</option>
          {equipment.map(item => <option key={item.id} value={item.id}>{item.equipmentNumber} — {item.name}</option>)}
        </select>
      </label>
      <div className="equipment-form-span">
        {selected && <EquipmentCompliancePanel key={selected} equipmentId={selected} canManage={canManage} onChanged={refreshRegister} />}
      </div>
    </div>
  </section>;
}
