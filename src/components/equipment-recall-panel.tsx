"use client";

import { type FormEvent, type Ref, useEffect, useState } from "react";
import type { EquipmentRecallRecord } from "@/lib/equipment/recall";

type Recall = Pick<EquipmentRecallRecord, "id" | "status" | "reason" | "scopeSummary" | "closureReason"> & {
  openedAt: string;
  closedAt: string | null;
};
type Command = { operation: "OPEN"; reason: string; scopeSummary: string } |
  { operation: "CLOSE"; recallId: string; reason: string };

export function EquipmentRecallPanel({ equipmentId, equipmentNumber, canManage, retired, activeHoldCount, headingRef, onChanged }: {
  equipmentId: string;
  equipmentNumber: string;
  canManage: boolean;
  retired: boolean;
  activeHoldCount: number;
  headingRef: Ref<HTMLHeadingElement>;
  onChanged: () => void;
}) {
  const [recalls, setRecalls] = useState<Recall[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [scopeSummary, setScopeSummary] = useState("");
  const openRecall = recalls?.find(recall => recall.status === "OPEN");
  const endpoint = `/api/equipment/${equipmentId}/recalls`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Equipment recalls unavailable");
        const { data }: { data: Recall[] } = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid recall history");
        if (!controller.signal.aborted) setRecalls(data);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [endpoint, revision]);

  function refresh() {
    setReason("");
    setScopeSummary("");
    setError("");
    setRecalls(null);
    setLoadError(false);
    setRevision(current => current + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || !recalls || !reason.trim()) return;
    if (openRecall ? activeHoldCount > 0 : retired || !scopeSummary.trim()) return;
    const command: Command = openRecall
      ? { operation: "CLOSE", recallId: openRecall.id, reason }
      : { operation: "OPEN", reason, scopeSummary };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Equipment recall operation failed.");
        return;
      }
      setNotice(command.operation === "OPEN"
        ? "An open recall is recorded. The equipment is quarantined."
        : "Recall closed. Review the current usability status before using this equipment.");
      refresh();
      onChanged();
    } catch {
      setError("Recall update could not be confirmed. Refresh the history before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card form-stack equipment-register-style" aria-labelledby="equipment-recalls-heading">
    <h3 id="equipment-recalls-heading" ref={headingRef} tabIndex={-1}>Equipment recalls — {equipmentNumber}</h3>
    {loadError && <p role="alert">Unable to load recall history.</p>}
    {!recalls && !loadError && <p role="status">Loading recall history…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {recalls?.length === 0 && <p>No recalls recorded.</p>}
    {recalls && recalls.length > 0 && <ul>
      {recalls.map(recall => <li key={recall.id}>
        <details open={recall.status === "OPEN"}>
          <summary>{recall.status === "OPEN" ? "Open recall · Equipment quarantined" : "Closed recall"} · {recall.openedAt.slice(0, 10)}</summary>
          <dl className="quality-record-details">
            <dt>Reason</dt><dd>{recall.reason}</dd>
            <dt>Affected scope</dt><dd>{recall.scopeSummary}</dd>
            {recall.closedAt && <>
              <dt>Closed on</dt><dd><time dateTime={recall.closedAt}>{recall.closedAt.slice(0, 10)} UTC</time></dd>
              <dt>Closure reason</dt><dd>{recall.closureReason}</dd>
            </>}
          </dl>
        </details>
      </li>)}
    </ul>}
    <div><button type="button" className="secondary-button" disabled={busy || (!recalls && !loadError)}
      onClick={refresh}>Refresh recall history</button></div>
    {canManage && recalls && (openRecall || !retired) && (
      openRecall && activeHoldCount > 0 ? <p role="status">Clear the active compliance holds before closing this recall.</p> :
        <form className="admin-form equipment-admin-form" onSubmit={submit}>
          <h4 className="equipment-form-span">{openRecall ? "Close recall" : "Open recall and quarantine"}</h4>
          <label className="equipment-form-wide">{openRecall ? "Closure reason" : "Recall reason"}
            <textarea required maxLength={2000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} />
          </label>
          {!openRecall && <label className="equipment-form-wide">Affected scope
            <textarea required maxLength={5000} disabled={busy} value={scopeSummary} onChange={event => setScopeSummary(event.target.value)} />
          </label>}
          <button type="submit" disabled={busy || !reason.trim() || (!openRecall && !scopeSummary.trim())}>
            {openRecall ? "Close recall" : "Open recall and quarantine"}
          </button>
        </form>
    )}
  </section>;
}
