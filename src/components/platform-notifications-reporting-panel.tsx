"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Delivery = {
  id: string;
  notificationType: string;
  subject: string;
  status: string;
  channel: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  readAt: string | null;
};

type ReportRun = {
  id: string;
  reportKey: string;
  generatedAt: string;
  result: {
    customers?: { total?: number; byStatus?: Record<string, number> };
    subscriptions?: { total?: number; byStatus?: Record<string, number> };
    entitlements?: { activeOverrides?: number };
    support?: { activeUnexpiredSessions?: number; customerHelpRequestsByStatus?: Record<string, number>; overdueResponseSla?: number; overdueClosureSla?: number; unassignedActiveRequests?: number };
    sales?: { currentAssignments?: number; customersByRepresentative?: Record<string, number>; newCustomersLast30Days?: number; newCustomersLast90Days?: number };
    commercial?: { monthlyRecurringRevenueByCurrency?: Record<string,string>; upcomingRenewalsNext90Days?: number; cancellations?: number; planMix?: Record<string,number>; moduleMix?: Record<string,number> };
    commissions?: { unpaidApprovedAmount?: string; accrualsByStatus?: Record<string, number>; accruedAmountByCurrency?: Record<string,string>; paidAmountByCurrency?: Record<string,string> };
    notifications?: { deadLetterCount?: number; retryCount?: number; byStatus?: Record<string, number> };
  };
};

export function PlatformNotificationsPanel({ canRead, canManage }: { canRead: boolean; canManage: boolean }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [inbox, setInbox] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const requests: Promise<void>[] = [];
      if (canManage) {
        requests.push(
          fetch("/api/platform/notifications/deliveries", { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("Notification delivery monitoring could not be loaded.");
            const payload = (await response.json()) as { data: Delivery[] };
            setDeliveries(payload.data);
          }),
        );
      }
      if (canRead) {
        requests.push(
          fetch("/api/platform/notifications/inbox", { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("Platform notification inbox could not be loaded.");
            const payload = (await response.json()) as { data: Delivery[] };
            setInbox(payload.data);
          }),
        );
      }
      await Promise.all(requests);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Platform notifications could not be loaded.");
    }
  }, [canManage, canRead]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const counts = useMemo(
    () => Object.fromEntries(deliveries.reduce<Array<[string, number]>>((entries, item) => {
      const existing = entries.find(([status]) => status === item.status);
      if (existing) existing[1] += 1;
      else entries.push([item.status, 1]);
      return entries;
    }, [])),
    [deliveries],
  );

  async function requeue(notificationId: string) {
    const reason = (reasons[notificationId] ?? "").trim();
    if (!reason) {
      setError("A requeue reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/platform/notifications/${notificationId}/requeue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Notification could not be requeued.");
      }
      setReasons((current) => ({ ...current, [notificationId]: "" }));
      await load();
    } catch (requeueError) {
      setError(requeueError instanceof Error ? requeueError.message : "Notification could not be requeued.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.grid}>
      {error ? <div className={styles.error}>{error}</div> : null}
      {canManage ? (
        <article className={styles.card}>
          <h3>Delivery monitoring</h3>
          <p>PENDING {counts.PENDING ?? 0} · RETRY {counts.RETRY ?? 0} · DEAD LETTER {counts.DEAD_LETTER ?? 0} · SENT {counts.SENT ?? 0}</p>
          {deliveries.filter((item) => item.status === "DEAD_LETTER").slice(0, 20).map((item) => (
            <div key={item.id} style={{ borderTop: "1px solid #dfe4ec", paddingTop: 12, marginTop: 12 }}>
              <strong>{item.subject}</strong>
              <p>{item.channel} · {item.attempts} attempts · {item.lastError ?? "No error detail"}</p>
              <input
                aria-label={`Requeue reason for ${item.subject}`}
                value={reasons[item.id] ?? ""}
                onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                placeholder="Reason for requeue"
                style={{ width: "100%", padding: 8, marginBottom: 8 }}
              />
              <button type="button" disabled={busy} onClick={() => void requeue(item.id)}>Requeue dead letter</button>
            </div>
          ))}
          {deliveries.filter((item) => item.status === "DEAD_LETTER").length === 0 ? <p>No dead-letter notifications.</p> : null}
        </article>
      ) : null}
      {canRead ? (
        <article className={styles.card}>
          <h3>My platform inbox</h3>
          <p>Only notifications addressed to your platform identity are shown.</p>
          {inbox.slice(0, 20).map((item) => (
            <div key={item.id} style={{ borderTop: "1px solid #dfe4ec", paddingTop: 12, marginTop: 12 }}>
              <strong>{item.subject}</strong>
              <p>{item.notificationType} · {new Date(item.createdAt).toLocaleString()} · {item.readAt ? "Read" : "Unread"}</p>
            </div>
          ))}
          {inbox.length === 0 ? <p>No delivered platform notifications.</p> : null}
        </article>
      ) : null}
    </div>
  );
}

export function PlatformReportingPanel() {
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/reports/operational", { cache: "no-store" });
      if (!response.ok) throw new Error("Platform report history could not be loaded.");
      const payload = (await response.json()) as { data: ReportRun[] };
      setRuns(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Platform report history could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/reports/operational", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Platform report could not be generated.");
      }
      await load();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Platform report could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  const latest = runs[0];
  const result = latest?.result;
  return (
    <div className={styles.grid}>
      {error ? <div className={styles.error}>{error}</div> : null}
      <article className={styles.card}>
        <h3>Commercial & operational summary</h3>
        <p>Aggregates control-plane customer, subscription, entitlement, support, sales, commission, and platform-notification data only.</p>
        <button type="button" disabled={busy} onClick={() => void generate()}>{busy ? "Generating…" : "Generate governed snapshot"}</button>
      </article>
      {latest && result ? (
        <article className={styles.card}>
          <h3>Latest snapshot</h3>
          <p>Generated {new Date(latest.generatedAt).toLocaleString()}</p>
          <p>Customers: {result.customers?.total ?? 0}</p>
          <p>Subscriptions: {result.subscriptions?.total ?? 0}</p>
          <p>Active entitlement overrides: {result.entitlements?.activeOverrides ?? 0}</p>
          <p>Active support sessions: {result.support?.activeUnexpiredSessions ?? 0}</p>
          <p>Customer Help requests — open: {result.support?.customerHelpRequestsByStatus?.OPEN ?? 0} · acknowledged: {result.support?.customerHelpRequestsByStatus?.ACKNOWLEDGED ?? 0} · closed: {result.support?.customerHelpRequestsByStatus?.CLOSED ?? 0}</p>
          <p>Support SLA overdue — response: {result.support?.overdueResponseSla ?? 0} · closure: {result.support?.overdueClosureSla ?? 0}</p>
          <p>Unassigned active support requests: {result.support?.unassignedActiveRequests ?? 0}</p>
          <p>Current sales assignments: {result.sales?.currentAssignments ?? 0}</p>
          <p>New customers — last 30 days: {result.sales?.newCustomersLast30Days ?? 0} · last 90 days: {result.sales?.newCustomersLast90Days ?? 0}</p>
          <p>Customers by salesperson: {Object.entries(result.sales?.customersByRepresentative ?? {}).map(([name,count]) => name+" "+count).join(" · ") || "None"}</p>
          <p>Monthly recurring revenue: {Object.entries(result.commercial?.monthlyRecurringRevenueByCurrency ?? {}).map(([currency,amount]) => currency+" "+amount).join(" · ") || "0.00"}</p>
          <p>Upcoming renewals (next 90 days): {result.commercial?.upcomingRenewalsNext90Days ?? 0} · cancellations: {result.commercial?.cancellations ?? 0}</p>
          <p>Plan mix: {Object.entries(result.commercial?.planMix ?? {}).map(([name,count]) => name+" "+count).join(" · ") || "None"}</p>
          <p>Module mix: {Object.entries(result.commercial?.moduleMix ?? {}).map(([name,count]) => name+" "+count).join(" · ") || "None"}</p>
          <p>Commission accrued: {Object.entries(result.commissions?.accruedAmountByCurrency ?? {}).map(([currency,amount]) => currency+" "+amount).join(" · ") || "0.00"}</p>
          <p>Commission paid: {Object.entries(result.commissions?.paidAmountByCurrency ?? {}).map(([currency,amount]) => currency+" "+amount).join(" · ") || "0.00"}</p>
          <p>Approved unpaid commission amount: {result.commissions?.unpaidApprovedAmount ?? "0.00"}</p>
          <p>Notification retries: {result.notifications?.retryCount ?? 0} · dead letters: {result.notifications?.deadLetterCount ?? 0}</p>
        </article>
      ) : (
        <div className={styles.notice}>No platform report snapshot has been generated yet.</div>
      )}
    </div>
  );
}
