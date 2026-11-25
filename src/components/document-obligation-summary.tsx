"use client";

import { useEffect, useState } from "react";

type Detail = { id: string; document: string; title: string; revision: string; action: string; assignee: string | null; dueAt: string | null; overdue: boolean };

type Counts = {
  details: Detail[];
  activeTechnicalReviews: number | null;
  currentAcknowledgmentCompletion: number | null;
  currentAcknowledgmentCompleted: number | null;
  currentAcknowledgmentTotal: number | null;
  periodicReviews: number | null;
  overduePeriodicReviews: number | null;
  pendingApprovals: number | null;
  pendingAcknowledgments: number | null;
  overdueAcknowledgments: number | null;
};

export function DocumentObligationSummary({canExport}: {canExport: boolean}) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [filter, setFilter] = useState("All");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reporting/document-obligations", { cache: "no-store" })
      .then(async response => {
        if (response.status === 403) { if (!cancelled) setState("denied"); return; }
        if (!response.ok) throw new Error("Unable to load");
        const body = await response.json();
        if (!cancelled) { setCounts(body.data); setState("ready"); }
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [refresh]);
  if (state === "denied") return null;
  const metrics: Array<[string, number | null]> = counts ? [
    ["Active technical review tasks", counts.activeTechnicalReviews],
    ["Outstanding periodic reviews", counts.periodicReviews],
    ["Overdue periodic reviews", counts.overduePeriodicReviews],
    ["Pending final approval tasks", counts.pendingApprovals],
    ["Outstanding acknowledgment assignments", counts.pendingAcknowledgments],
    ["Overdue acknowledgment assignments", counts.overdueAcknowledgments],
  ] : [];
  const rows = (counts?.details ?? []).filter(row => (filter === "All" || row.action === filter) && (!overdueOnly || row.overdue));
  function exportSnapshot() {
    if (!canExport || state !== "ready") return;
    const escapeCell = (value: string) => '"' + (/^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
    const csv = [["Document", "Title", "Revision", "Action", "Assignee", "Due date (UTC)", "Status"], ...rows.map(row => [row.document, row.title, row.revision, row.action, row.assignee ?? "", row.dueAt ?? "", row.overdue ? "Overdue" : "Outstanding"])].map(row => row.map(escapeCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "document-obligations-working-snapshot.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="card reporting-history-card" aria-labelledby="document-obligation-summary">
    <h3 id="document-obligation-summary">Document control obligations</h3>
    <p>Current organization-wide obligations available under your assigned permissions. Overdue counts are subsets of outstanding counts.</p>
    <button type="button" disabled={state === "loading"} onClick={() => { setCounts(null); setState("loading"); setRefresh(value => value + 1); }}>Refresh counts</button>
    {state === "loading" && <p role="status">Loading document obligations…</p>}
    {state === "error" && <p role="alert">Document obligations could not be loaded. Try refreshing.</p>}
    {state === "ready" && <div className="stat-grid reporting-stat-grid">{metrics.filter(([, value]) => value !== null).map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>}
    {state === "ready" && <>
      {counts?.currentAcknowledgmentTotal != null && <p><strong>Current effective-version acknowledgment completion:</strong> {counts.currentAcknowledgmentCompletion === null ? "Not applicable (no assignments)" : `${counts.currentAcknowledgmentCompletion}% (${counts.currentAcknowledgmentCompleted} of ${counts.currentAcknowledgmentTotal})`}</p>}
      <h4>Outstanding obligations</h4>
      <button type="button" onClick={() => window.dispatchEvent(new Event("trace-qms:open-documents"))}>Open document control workspace</button>
      {canExport && <button type="button" disabled={!rows.length} onClick={exportSnapshot}>Export filtered working snapshot (CSV)</button>}
      {canExport && <p>Working snapshot only; not a finalized or signed report.</p>}
      <label>Action type<select value={filter} onChange={event => setFilter(event.target.value)}><option>All</option>{counts?.activeTechnicalReviews != null && <option>Technical review</option>}{counts?.periodicReviews !== null && <option>Periodic review</option>}{counts?.pendingApprovals !== null && <option>Final approval</option>}{counts?.pendingAcknowledgments !== null && <option>Acknowledgment</option>}</select></label>
      <label><input type="checkbox" checked={overdueOnly} onChange={event => setOverdueOnly(event.target.checked)} /> Overdue only</label>
      <div className="table-wrap"><table><thead><tr><th>Document</th><th>Version</th><th>Action</th><th>Assignee</th><th>Due date</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.action + row.id}><td><strong>{row.document}</strong><span>{row.title}</span></td><td>{row.revision}</td><td>{row.action}</td><td>{row.assignee ?? "Not shown"}</td><td>{row.dueAt ? new Date(row.dueAt).toLocaleDateString() : "Not shown"}</td><td>{row.overdue ? "Overdue" : "Outstanding"}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>No outstanding obligations match the selected filters.</p>}
    </>}
  </section>;
}
