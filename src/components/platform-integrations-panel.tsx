"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Connection = { id: string; adapterKey: string; displayName: string; status: string; credentialRef: string | null; lockVersion: number };
type Delivery = { id: string; connectionId: string; eventType: string; status: string; attemptCount: number; lastError: string | null };

export function PlatformIntegrationsPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [connectionsResponse, deliveriesResponse] = await Promise.all([
        fetch("/api/platform/integrations/connections", { cache: "no-store" }),
        fetch("/api/platform/integrations/deliveries", { cache: "no-store" }),
      ]);
      if (!connectionsResponse.ok || !deliveriesResponse.ok) throw new Error("Integration state could not be loaded.");
      setConnections((await connectionsResponse.json()).data);
      setDeliveries((await deliveriesResponse.json()).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Integration state could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createConnection(formData: FormData) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/platform/integrations/connections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adapterKey: String(formData.get("adapterKey") ?? ""),
          displayName: String(formData.get("displayName") ?? ""),
          credentialRef: String(formData.get("credentialRef") ?? "") || null,
          reason: String(formData.get("reason") ?? ""), configuration: {},
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Connection could not be created.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection could not be created.");
    } finally { setBusy(false); }
  }

  async function requeue(deliveryId: string) {
    const reason = window.prompt("Reason for requeue");
    if (!reason) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/platform/integrations/deliveries/${deliveryId}/requeue`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Delivery could not be requeued.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Delivery could not be requeued."); }
    finally { setBusy(false); }
  }

  return (
    <div className={styles.grid}>
      <article className={styles.card}>
        <h3>Vendor-neutral integration boundary</h3>
        <p>PR 10 defines adapter, credential-reference, outbound delivery, inbound verification, idempotency, retry, dead-letter, and audit contracts. No provider adapter or credential backend is shipped in this PR.</p>
      </article>
      <article className={styles.card}>
        <h3>Create draft connection</h3>
        <form action={createConnection}>
          <p><input name="adapterKey" required maxLength={160} placeholder="Adapter key (future provider)" /></p>
          <p><input name="displayName" required maxLength={240} placeholder="Display name" /></p>
          <p><input name="credentialRef" maxLength={500} placeholder="Opaque external credential reference (optional)" /></p>
          <p><input name="reason" required maxLength={1000} placeholder="Governance reason" /></p>
          <button type="submit" disabled={busy}>Create draft</button>
        </form>
      </article>
      {error ? <div className={styles.error}>{error}</div> : null}
      <article className={styles.card}>
        <h3>Connections</h3>
        {connections.length === 0 ? <p>No platform integration connections.</p> : connections.map((item) => (
          <p key={item.id}><strong>{item.displayName}</strong><br />{item.adapterKey} · {item.status} · credential {item.credentialRef ? "referenced externally" : "not configured"}</p>
        ))}
      </article>
      <article className={styles.card}>
        <h3>Outbound delivery monitor</h3>
        {deliveries.length === 0 ? <p>No platform integration deliveries.</p> : deliveries.map((item) => (
          <p key={item.id}><strong>{item.eventType}</strong><br />{item.status} · attempts {item.attemptCount}{item.lastError ? ` · ${item.lastError}` : ""}{item.status === "DEAD_LETTER" ? <><br /><button type="button" disabled={busy} onClick={() => void requeue(item.id)}>Requeue</button></> : null}</p>
        ))}
      </article>
    </div>
  );
}
