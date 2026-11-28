"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { EquipmentHoldReadiness, EquipmentImpactDisposition } from "@/lib/equipment/compliance";
import { equipmentHoldEvidenceType, findActiveEquipmentHold, type EquipmentEvidenceType } from "@/lib/equipment/workspace-selection";
import { EquipmentImpactHistory, type EquipmentImpactHistoryRow } from "./equipment-impact-history";

type Hold = Pick<EquipmentHoldReadiness, "id" | "kind" | "clearanceReason" | "canClear"> & {
  dueAt: string;
  detectedAt: string;
  clearedAt: string | null;
  currentDueAt: string | null;
};

export function EquipmentCompliancePanel({ equipmentId, initialHoldId, canManage, onChanged, onRecordEvidence }: {
  equipmentId: string;
  initialHoldId?: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onRecordEvidence?: (holdId: string, evidenceType: EquipmentEvidenceType) => void;
}) {
  const [holds, setHolds] = useState<Hold[] | null>(null);
  const [impactHistory, setImpactHistory] = useState<EquipmentImpactHistoryRow[] | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [holdId, setHoldId] = useState(initialHoldId ?? "");
  const [disposition, setDisposition] = useState<EquipmentImpactDisposition>("NO_IMPACT");
  const [scopeSummary, setScopeSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [clearanceReason, setClearanceReason] = useState("");
  const endpoint = `/api/equipment/${equipmentId}/compliance`;
  const holdLabels = useMemo(() => new Map(holds?.map(hold => [
    hold.id, `${hold.kind === "CALIBRATION_OVERDUE" ? "Calibration" : "Maintenance"} due ${hold.dueAt.slice(0, 10)}`,
  ])), [holds]);
  const activeHolds = holds?.filter(hold => !hold.clearedAt) ?? [];
  const selectedHold = holds && findActiveEquipmentHold(holds, holdId);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(body?.data)) throw new Error(body?.error ?? "Unable to load equipment compliance records.");
        if (controller.signal.aborted) return;
        const loaded: Hold[] = body.data;
        setHolds(loaded);
        setImpactHistory(body.impactHistory ?? []);
        setHoldId(current => current || findActiveEquipmentHold(loaded)?.id || "");
      })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [endpoint, revision]);

  function refresh() {
    setHolds(null);
    setImpactHistory(null);
    setLoadError("");
    setRevision(current => current + 1);
  }

  useEffect(() => {
    function equipmentChanged(event: Event) {
      if ((event as CustomEvent<{ equipmentId?: string }>).detail?.equipmentId === equipmentId) refresh();
    }
    window.addEventListener("qms:equipment-changed", equipmentChanged);
    return () => window.removeEventListener("qms:equipment-changed", equipmentChanged);
  }, [equipmentId]);

  function selectHold(id: string) {
    setHoldId(id);
    setDisposition("NO_IMPACT");
    setScopeSummary("");
    setRationale("");
    setClearanceReason("");
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>, operation: "ASSESS_IMPACT" | "CLEAR_HOLD") {
    event.preventDefault();
    if (!canManage || !selectedHold || busy) return;
    if (operation === "CLEAR_HOLD" ? !selectedHold.canClear || !clearanceReason.trim() : !scopeSummary.trim() || !rationale.trim()) return;
    setBusy(true);
    setMessage("");
    setError("");
    const command = operation === "CLEAR_HOLD"
      ? { operation, holdId, reason: clearanceReason }
      : { operation, holdId, disposition, scopeSummary, rationale };
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Equipment compliance update failed.");
        return;
      }
      if (operation === "CLEAR_HOLD") setClearanceReason("");
      else {
        setScopeSummary("");
        setRationale("");
      }
      setMessage(operation === "CLEAR_HOLD"
        ? "Compliance hold cleared and audited. Review equipment usability before use."
        : body?.data?.qualityEventId
          ? "Impact assessment recorded and linked to a quality event."
          : "Impact assessment recorded and audited.");
      await onChanged();
    } catch {
      setError("The update could not be confirmed. Refresh the compliance records before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="form-stack">
    <h3>Compliance holds &amp; impact assessment</h3>
    <p>An active hold makes otherwise-active equipment unavailable for use.</p>
    {loadError && <p role="alert">{loadError}</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!holds && !loadError && <p role="status">Loading compliance records…</p>}
    {holds?.length === 0 && <p>No compliance holds recorded.</p>}
    {holds && holds.length > 0 && <ul>
      {holds.map(hold => <li key={hold.id}>
        <strong>{holdLabels.get(hold.id)}</strong> · Detected {hold.detectedAt.slice(0, 10)} ·{" "}
        {hold.clearedAt ? `Cleared ${hold.clearedAt.slice(0, 10)}` : "Active"}
        {hold.clearanceReason && ` — ${hold.clearanceReason}`}
      </li>)}
    </ul>}
    <div><button type="button" className="secondary-button" disabled={busy || (!holds && !loadError)} onClick={refresh}>Refresh compliance records</button></div>
    <EquipmentImpactHistory entries={impactHistory} holdLabels={holdLabels} />
    {holds && initialHoldId && holdId === initialHoldId && !selectedHold && !message &&
      <p role="status">The requested hold is no longer active.</p>}
    {activeHolds.length > 0 &&
      <label>Active hold
        <select disabled={busy} value={selectedHold?.id ?? ""} onChange={event => selectHold(event.target.value)}>
          <option value="" disabled>Select an active hold</option>
          {activeHolds.map(hold => <option key={hold.id} value={hold.id}>{holdLabels.get(hold.id)}</option>)}
        </select>
      </label>
    }
    {selectedHold && <>
      <dl className="quality-record-details">
        <dt>Due date on the hold</dt><dd>{selectedHold.dueAt.slice(0, 10)}</dd>
        <dt>Current next due date</dt><dd>{selectedHold.currentDueAt?.slice(0, 10) ?? "No date recorded"}</dd>
        <dt>Clearance readiness</dt>
        <dd>{selectedHold.canClear
          ? "The date requirement is met. A manager can clear the hold with a reason."
          : "The current next due date must be later than the due date on the hold."}</dd>
      </dl>
      {canManage && onRecordEvidence && !selectedHold.canClear && <div>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => onRecordEvidence(selectedHold.id, equipmentHoldEvidenceType[selectedHold.kind])}>
          {selectedHold.kind === "CALIBRATION_OVERDUE" ? "Record calibration evidence" : "Record maintenance evidence"}
        </button>
      </div>}
      {canManage && <>
        <form className="form-stack" onSubmit={event => void submit(event, "ASSESS_IMPACT")}>
          <h4>Record impact assessment</h4>
          <label>Disposition<select disabled={busy} value={disposition} onChange={event => setDisposition(event.target.value as EquipmentImpactDisposition)}>
            <option value="NO_IMPACT">No impact</option>
            <option value="POTENTIAL_IMPACT">Potential impact</option>
            <option value="CONFIRMED_IMPACT">Confirmed impact</option>
          </select></label>
          <label>Affected scope<textarea disabled={busy} required maxLength={5000} value={scopeSummary} onChange={event => setScopeSummary(event.target.value)} /></label>
          <label>Assessment rationale<textarea disabled={busy} required maxLength={5000} value={rationale} onChange={event => setRationale(event.target.value)} /></label>
          <button type="submit" disabled={busy || !scopeSummary.trim() || !rationale.trim()}>Record impact assessment</button>
        </form>
        <form className="form-stack" onSubmit={event => void submit(event, "CLEAR_HOLD")}>
          <h4>Clear compliance hold</h4>
          <label>Required clearance reason
            <textarea disabled={busy || !selectedHold.canClear} required maxLength={1000} value={clearanceReason} onChange={event => setClearanceReason(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !selectedHold.canClear || !clearanceReason.trim()}>Clear compliance hold</button>
        </form>
      </>}
    </>}
  </section>;
}
