"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Intake = {
  id: string; organizationName: string; submittedByName: string; subject: string; description: string;
  category: string; priority: string; status: "OPEN" | "ACKNOWLEDGED" | "CLOSED";
  applicationVersion: string | null; pageContext: string | null; browserFamily: string | null;
  correlationId: string | null; submittedAt: string; acknowledgedAt: string | null; closedAt: string | null;
  assignedToIdentityId: string | null; assigneeName: string | null; assignedAt: string | null;
  responseDueAt: string | null; closureDueAt: string | null;
  responseSlaState: "NONE" | "ON_TRACK" | "OVERDUE" | "MET";
  closureSlaState: "NONE" | "ON_TRACK" | "OVERDUE" | "MET";
  linkedSupportCaseId: string | null; linkedSupportCaseNumber: string | null;
};
type Owner = { platformIdentityId: string; displayName: string };

export function PlatformSupportIntakePanel() {
  const [items, setItems] = useState<Intake[] | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"OPEN" | "ACKNOWLEDGED" | "CLOSED" | "ALL">("OPEN");
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  async function load(nextStatus = status) {
    setError(null);
    const suffix = nextStatus === "ALL" ? "" : `?status=${nextStatus}`;
    const response = await fetch(`/api/platform/support/intake${suffix}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Support intake queue could not be loaded.");
    const body = await response.json() as { data: Intake[] };
    setItems(body.data);
  }

  async function loadOwners() {
    const response = await fetch("/api/platform/support/intake?view=owners", { cache: "no-store" });
    if (!response.ok) throw new Error("Support owners could not be loaded.");
    const body = await response.json() as { data: Owner[] };
    setOwners(body.data);
  }

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([load(), loadOwners()])).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Support intake queue could not be loaded."));
  }, []);

  async function post(item: Intake, body: Record<string, unknown>) {
    const response = await fetch(`/api/platform/support/intake?id=${encodeURIComponent(item.id)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!response.ok) { const payload = await response.json().catch(() => null); setError(payload?.error || "Support queue action failed."); return; }
    await load();
  }

  async function act(item: Intake, action: "ACKNOWLEDGE" | "CLOSE") {
    const reason = window.prompt(action === "ACKNOWLEDGE" ? "Reason for acknowledgement" : "Reason for closure");
    if (!reason?.trim()) return;
    await post(item, { action, reason });
  }

  async function assign(item: Intake) {
    const defaultOwner = item.assignedToIdentityId ?? owners[0]?.platformIdentityId;
    const ownerId = window.prompt("Platform identity ID to assign", defaultOwner ?? "");
    if (!ownerId?.trim()) return;
    if (!owners.some((owner) => owner.platformIdentityId === ownerId.trim())) { setError("Select an active platform support member."); return; }
    const responseDueAt = window.prompt("Response due time (ISO 8601) — leave blank for no response SLA", item.responseDueAt ?? "");
    if (responseDueAt === null) return;
    const closureDueAt = window.prompt("Closure due time (ISO 8601) — leave blank for no closure SLA", item.closureDueAt ?? "");
    if (closureDueAt === null) return;
    const reason = window.prompt("Reason for assignment / SLA change");
    if (!reason?.trim()) return;
    await post(item, {
      action: "ASSIGN", assignedToIdentityId: ownerId.trim(),
      responseDueAt: responseDueAt.trim() || null, closureDueAt: closureDueAt.trim() || null, reason,
    });
  }

  async function createControlledCase(item: Intake) {
    const reason = window.prompt("Reason controlled tenant support access may be required");
    if (!reason?.trim()) return;
    const response = await fetch(`/api/platform/support/intake?id=${encodeURIComponent(item.id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "CREATE_SUPPORT_CASE", reason }),
    });
    const payload = await response.json().catch(() => null) as { data?: { supportCaseId?: string; caseNumber?: string }; error?: string } | null;
    if (!response.ok) { setError(payload?.error || "Controlled support case could not be created."); return; }
    setScanNotice(`Controlled support case ${payload?.data?.caseNumber ?? ""} created. Tenant access still requires a separate access request and approval.`);
    await load();
  }

  async function scanOverdueSlas() {
    setScanBusy(true); setError(null); setScanNotice(null);
    try {
      const response = await fetch("/api/platform/support/sla-escalations", { method: "POST" });
      const payload = await response.json().catch(() => null) as { data?: { evaluated?: number; notificationsCreated?: number }; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Support SLA escalation scan failed.");
      setScanNotice(`SLA scan complete: ${payload?.data?.evaluated ?? 0} overdue requests evaluated, ${payload?.data?.notificationsCreated ?? 0} new alerts created.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Support SLA escalation scan failed."); }
    finally { setScanBusy(false); }
  }

  function changeStatus(next: typeof status) { setStatus(next); void load(next).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Support intake queue could not be loaded.")); }
  function formatSla(label: string, state: Intake["responseSlaState"], dueAt: string | null) {
    return dueAt ? `${label}: ${state.replace("_", " ").toLowerCase()} · ${new Date(dueAt).toLocaleString()}` : `${label}: not set`;
  }

  return <div>
    <div className={styles.grid}>
      <article className={styles.card}><h3>Customer support intake</h3><p>Review, assign, and track tenant-submitted Help requests without entering the tenant QMS or creating a support session.</p></article>
      <article className={styles.card}><h3>Controlled tenant access</h3><p>If troubleshooting later requires tenant access, use the separate case-bound approval workflow.</p><a className={styles.cardLink} href="/support-access">Open support access</a></article>
    </div>
    <div className={styles.toolbar}>
      <button type="button" disabled={scanBusy} onClick={() => void scanOverdueSlas()}>{scanBusy ? "Scanning…" : "Scan overdue SLAs"}</button>
    </div>
    {scanNotice ? <div className={styles.notice} role="status">{scanNotice}</div> : null}
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
        <p><strong>Owner:</strong> {item.assigneeName || "Unassigned"}</p>
        <p><strong>Submitted:</strong> {new Date(item.submittedAt).toLocaleString()}</p>
        <p><strong>SLA:</strong> {formatSla("Response", item.responseSlaState, item.responseDueAt)}<br />{formatSla("Closure", item.closureSlaState, item.closureDueAt)}</p>
        <p><strong>Context:</strong> {item.pageContext ?? "Not provided"} · <strong>Browser:</strong> {item.browserFamily ?? "Not provided"}</p>
        <p><strong>App version:</strong> {item.applicationVersion ?? "Not provided"} · <strong>Correlation:</strong> {item.correlationId ?? "Not provided"}</p>
        <p><strong>Controlled support case:</strong> {item.linkedSupportCaseNumber ?? "Not created"}</p>
        <div className={styles.toolbar}>
          {item.status !== "CLOSED" ? <button type="button" onClick={() => void assign(item)}>{item.assignedToIdentityId ? "Reassign / SLA" : "Assign / SLA"}</button> : null}
          {item.status !== "CLOSED" && !item.linkedSupportCaseId ? <button type="button" onClick={() => void createControlledCase(item)}>Create controlled support case</button> : null}
          {item.linkedSupportCaseId ? <a className={styles.cardLink} href="/support-access">Open controlled support access</a> : null}
          {item.status === "OPEN" ? <button type="button" onClick={() => void act(item, "ACKNOWLEDGE")}>Acknowledge</button> : null}
          {item.status !== "CLOSED" ? <button type="button" onClick={() => void act(item, "CLOSE")}>Close</button> : null}
        </div>
      </article>)}
    </div>
  </div>;
}
