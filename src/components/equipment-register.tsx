"use client";

import type { EquipmentEvidenceType } from "@/lib/equipment/workspace-selection";
import { useMemo, useState } from "react";
import { equipmentWorklist, filterEquipmentWorklist, type EquipmentWorklistItem, type EquipmentWorklistView } from "@/lib/equipment/worklist";

const views: ReadonlyArray<{ value: EquipmentWorklistView; label: string }> = [
  { value: "all", label: "All equipment" },
  { value: "holds", label: "Active compliance holds" },
  { value: "clearance-ready", label: "Holds ready for clearance review" },
  { value: "recalls", label: "Open recalls" },
  { value: "unavailable", label: "Not usable, excluding retired" },
  { value: "overdue", label: "Overdue calibration or maintenance" },
  { value: "due-soon", label: "Due within 30 days" },
  { value: "missing-date", label: "Missing required due date" },
];
const scheduleLabels = {
  "not-required": "Not required",
  "missing-date": "Missing due date",
  overdue: "Overdue",
  "due-soon": "Due within 30 days",
  scheduled: "",
  inactive: "",
};

const actionableSchedules = new Set(["overdue", "due-soon", "missing-date"]);

export function EquipmentRegister({ equipment, today, selected, onSelect, onReviewHolds, onRecordEvidence, onReviewRecalls }: {
  equipment: EquipmentWorklistItem[];
  today: string;
  selected: string;
  onSelect: (id: string) => void;
  onReviewHolds: (id: string, holdId?: string) => void;
  onReviewRecalls: (id: string) => void;
  onRecordEvidence?: (id: string, type: EquipmentEvidenceType) => void;
}) {
  const [view, setView] = useState<EquipmentWorklistView>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const rows = useMemo(() => equipmentWorklist(equipment, today), [equipment, today]);
  const visible = filterEquipmentWorklist(rows, { query, view, status });

  function schedule(date: string | null, state: keyof typeof scheduleLabels) {
    if (state === "not-required") return scheduleLabels[state];
    return [date?.slice(0, 10), scheduleLabels[state]].filter(Boolean).join(" · ") || "—";
  }

  return <div className="module-section-stack">
    <h3>Equipment register</h3>
    <div className="admin-form">
      <label>Search equipment
        <input type="search" placeholder="Equipment number or name" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <label>View
        <select value={view} onChange={event => setView(event.target.value as EquipmentWorklistView)}>
          {views.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>Status
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="ACTIVE">Active</option>
          <option value="OUT_OF_SERVICE">Out of service</option>
          <option value="RETIRED">Retired</option>
        </select>
      </label>
      <button type="button" disabled={!query && !status && view === "all"} onClick={() => {
        setQuery("");
        setStatus("");
        setView("all");
      }}>Clear filters</button>
    </div>
    <p role="status">Showing {visible.length} of {equipment.length} equipment records</p>
    <div className="table-wrap"><table>
      <thead><tr><th>Equipment</th><th>Status</th><th>Usability</th><th>Calibration due</th><th>Maintenance due</th><th>Holds</th><th>Recalls</th><th>Actions</th></tr></thead>
      <tbody>
        {visible.map(({ item, calibration, maintenance }) => {
          const readyHoldId = view === "clearance-ready" ? item.firstReadyHoldId ?? undefined : undefined;
          const reviewLabel = readyHoldId ? "Review ready hold" : "Review holds";
          return <tr key={item.id}>
            <td><button type="button" className="link-button" aria-pressed={selected === item.id}
              onClick={() => onSelect(item.id)}>{item.equipmentNumber} — {item.name}</button></td>
            <td>{item.status.replaceAll("_", " ")}</td>
            <td><strong>{item.usable ? "Usable" : "Not usable"}</strong></td>
            <td>{schedule(item.nextCalibrationDueAt, calibration)}</td>
            <td>{schedule(item.nextMaintenanceDueAt, maintenance)}</td>
            <td>{item.activeHoldCount}{item.readyHoldCount > 0 && ` · ${item.readyHoldCount} ready`}</td>
            <td><button type="button" className="link-button"
              aria-label={`Review recalls for ${item.equipmentNumber}, ${item.openRecallCount} open`}
              onClick={() => onReviewRecalls(item.id)}>{item.openRecallCount} open</button></td>
            <td>
              {item.activeHoldCount > 0 && <button type="button" className="secondary-button"
                aria-label={`${reviewLabel} for ${item.equipmentNumber}`}
                onClick={() => onReviewHolds(item.id, readyHoldId)}>{reviewLabel}</button>}
              {onRecordEvidence && actionableSchedules.has(calibration) && <button type="button" className="secondary-button"
                aria-label={`Record calibration for ${item.equipmentNumber}`}
                onClick={() => onRecordEvidence(item.id, "CALIBRATED")}>Record calibration</button>}
              {onRecordEvidence && actionableSchedules.has(maintenance) && <button type="button" className="secondary-button"
                aria-label={`Record maintenance for ${item.equipmentNumber}`}
                onClick={() => onRecordEvidence(item.id, "MAINTENANCE")}>Record maintenance</button>}
            </td>
          </tr>;
        })}
        {visible.length === 0 && <tr><td colSpan={8}>{equipment.length
          ? "No equipment matches these filters."
          : "No equipment has been registered."}</td></tr>}
      </tbody>
    </table></div>
  </div>;
}
