"use client";

import { useEffect, useState } from "react";

type Counts = {
  periodicReviews: number | null;
  overduePeriodicReviews: number | null;
  pendingApprovals: number | null;
  pendingAcknowledgments: number | null;
  overdueAcknowledgments: number | null;
};

export function DocumentObligationSummary() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
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
    ["Scheduled periodic reviews", counts.periodicReviews],
    ["Overdue periodic reviews", counts.overduePeriodicReviews],
    ["Pending final approval tasks", counts.pendingApprovals],
    ["Outstanding acknowledgment assignments", counts.pendingAcknowledgments],
    ["Overdue acknowledgment assignments", counts.overdueAcknowledgments],
  ] : [];
  return <section className="card reporting-history-card" aria-labelledby="document-obligation-summary">
    <h3 id="document-obligation-summary">Document control obligations</h3>
    <p>Current organization-wide obligations available under your assigned permissions. Overdue counts are subsets of outstanding counts.</p>
    <button type="button" disabled={state === "loading"} onClick={() => { setCounts(null); setState("loading"); setRefresh(value => value + 1); }}>Refresh counts</button>
    {state === "loading" && <p role="status">Loading document obligations…</p>}
    {state === "error" && <p role="alert">Document obligations could not be loaded. Try refreshing.</p>}
    {state === "ready" && <div className="stat-grid reporting-stat-grid">{metrics.filter(([, value]) => value !== null).map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>}
  </section>;
}
