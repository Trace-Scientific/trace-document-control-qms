"use client";

import { useEffect, useState } from "react";
import type { CapaWorkItem } from "@/lib/quality/capa";

const stages = {
  OPEN: "Action open",
  NEEDS_CHECK: "Awaiting effectiveness check",
  FAILED_CHECK: "Failed effectiveness check",
};

export function QualityCapaWorklist({ userId, today, onOpen }: {
  userId: string;
  today: string;
  onOpen: (item: CapaWorkItem) => void;
}) {
  const [items, setItems] = useState<CapaWorkItem[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [owner, setOwner] = useState("all");
  const [stage, setStage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/quality/events/capa-worklist", { credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load the CAPA worklist");
        const body: { data: CapaWorkItem[] } = await response.json();
        if (!Array.isArray(body.data)) throw new Error("Unable to load the CAPA worklist");
        if (!controller.signal.aborted) setItems(body.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Unable to load the CAPA worklist.");
      });
    return () => controller.abort();
  }, [revision]);

  const visibleItems = items?.filter(item =>
    (owner === "all" || item.ownerUserId === userId) && (!stage || item.stage === stage),
  );

  function refresh() {
    setItems(null);
    setError("");
    setRevision(current => current + 1);
  }

  return <section className="module-section-stack" aria-labelledby="capa-worklist-heading">
    <div className="section-heading"><div>
      <h3 id="capa-worklist-heading">CAPA worklist</h3>
      <p>Find open actions and completed actions that still need a passing effectiveness check.</p>
    </div></div>
    <div className="admin-form">
      <label>Action owner<select value={owner} onChange={event => setOwner(event.target.value)}>
        <option value="all">All action owners</option>
        <option value="mine">My assigned actions</option>
      </select></label>
      <label>Work status<select value={stage} onChange={event => setStage(event.target.value)}>
        <option value="">All pending work</option>
        {Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="button" className="secondary-button" onClick={refresh} disabled={!items && !error}>Refresh worklist</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!items && !error && <p role="status">Loading CAPA worklist…</p>}
    {items && visibleItems && <>
      <p role="status">Showing {visibleItems.length} of {items.length} pending CAPA actions</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Quality event</th><th>CAPA action</th><th>Action owner</th><th>Work status</th><th>Action due</th><th>Completed</th><th>Open</th></tr></thead>
        <tbody>
          {visibleItems.map(item => <tr key={item.id}>
            <td><strong>{item.eventNumber}</strong><br />{item.eventSummary}</td>
            <td>{item.description}</td>
            <td>{item.ownerName || "Assigned user"}</td>
            <td>{stages[item.stage]}{item.stage === "OPEN" && item.dueAt < today ? " · Overdue" : ""}</td>
            <td>{item.dueAt}</td>
            <td>{item.completedAt ?? "—"}</td>
            <td><button type="button" className="secondary-button" onClick={() => onOpen(item)}
              aria-label={`Open CAPA for ${item.eventNumber}: ${item.description}`}>Open CAPA</button></td>
          </tr>)}
          {!visibleItems.length && <tr><td colSpan={7}>{items.length
            ? "No pending CAPA actions match these filters."
            : "No pending CAPA actions across active quality events."}</td></tr>}
        </tbody>
      </table></div>
    </>}
  </section>;
}
