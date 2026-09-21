"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Intake = {
  id: string; organizationName: string; submittedByName: string; subject: string; description: string;
  category: string; priority: string; status: "OPEN" | "ACKNOWLEDGED" | "CLOSED";
  applicationVersion: string | null; pageContext: string | null; browserFamily: string | null;
  correlationId: string | null; submittedAt: string; acknowledgedAt: string | null; closedAt: string | null;
};

export function PlatformSupportIntakePanel() {
  const [items, setItems] = useState<Intake[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"OPEN" | "ACKNOWLEDGED" | "CLOSED" | "ALL">("OPEN");

  async function load(nextStatus = status) {
    setError(null);
    const suffix = nextStatus === "ALL" ? "" : `?status=${nextStatus}`;
    const response = await fetch(`/api/platform/support/intake${suffix}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Support intake queue could not be loaded.");
    const body = await response.json() as { data: Intake[] };
    setItems(body.data);
  }

  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Support intake queue could not be loaded.")); }, []);

  async function act(item: Intake, action: "ACKNOWLEDGE" | "CLOSE") {
    const reason = window.prompt(action === "ACKNOWLEDGE" ? "Reason for acknowledgement" : "Reason for closure");
    if (!reason?.trim()) return;
    const response = await fetch(`/api/platform/support/intake?id=${encodeURIComponent(item.id)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason }),
    });
    if (!response.ok) { const body = await response.json().catch(() => null); setError(body?.error || "Support queue action failed."); return; }
    await load();
  }

  function changeStatus(next: typeof status) { setStatus(next); void load(next).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Support intake queue could not be loaded.")); }

  return <div>
    <div className={styles.grid}>
      <article className={styles.card}><h3>Customer support intake</h3><p>Review tenant-submitted Help requests without entering the tenant QMS or creating a support session.</p></article>
      <article className={styles.card}><h3>Controlled tenant access</h3><p>If troubleshooting later requires tenant access, use the separate case-bound approval workflow.</p><a className={styles.cardLink} href="/support-access">Open support access</a></article>
    </div>
    <div className={styles.toolbar} aria-label="Support intake status filter">
      {(["OPEN","ACKNOWLEDGED","CLOSED","ALL"] as const).map((value) => <button type="button" key={value} onClick={() => changeStatus(value)} disabled={status === value}>{value === "ALL" ? "All" : value.toLowerCase()}</button>)}
    </div>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {!items ? <div className={styles.notice}>Loading customer support requests…</div> : null}
    {items?.length === 0 ? <div className={styles.notice}>No support requests match this filter.</div> : null}
    <div className={styles.grid}>
      {items?.map((item) => <article className={styles.card} key={item.id}>
        <p className={styles.eyebrow}>{item.priority} · {item.category} · {item.status}</p>
        <h3>{item.subject}</h3>
        <p>{item.description}</p>
        <p><strong>Customer:</strong> {item.organizationName}</p>
        <p><strong>Submitted by:</strong> {item.submittedByName || "Tenant user"}</p>
        <p><strong>Submitted:</strong> {new Date(item.submittedAt).toLocaleString()}</p>
        <p><strong>Context:</strong> {item.pageContext ?? "Not provided"} · <strong>Browser:</strong> {item.browserFamily ?? "Not provided"}</p>
        <p><strong>App version:</strong> {item.applicationVersion ?? "Not provided"} · <strong>Correlation:</strong> {item.correlationId ?? "Not provided"}</p>
        <div className={styles.toolbar}>
          {item.status === "OPEN" ? <button type="button" onClick={() => void act(item, "ACKNOWLEDGE")}>Acknowledge</button> : null}
          {item.status !== "CLOSED" ? <button type="button" onClick={() => void act(item, "CLOSE")}>Close</button> : null}
        </div>
      </article>)}
    </div>
  </div>;
}
