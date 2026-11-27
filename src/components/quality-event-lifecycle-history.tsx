"use client";

import { useEffect, useState } from "react";
import type { QualityEventLifecycleChange } from "@/lib/quality/events";

type Change = Omit<QualityEventLifecycleChange, "createdAt"> & { createdAt: string };

const changeLabels: Record<Change["kind"], string> = {
  STATUS: "Status",
  OWNER: "Owner",
  DUE_DATE: "Due date",
};

function changeValue(kind: Change["kind"], value: string | null, ownerName: string | null) {
  if (kind === "OWNER") return value ? ownerName || "Assigned user" : "Unassigned";
  if (kind === "DUE_DATE") return value ?? "No due date";
  return value?.replaceAll("_", " ") ?? "—";
}

export function QualityEventLifecycleHistory({ eventId }: { eventId: string }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/quality/events/${eventId}/history`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Unable to load quality event history");
      const body: { data: Change[] } = await response.json();
      if (!Array.isArray(body.data)) throw new Error("Invalid lifecycle history response");
      if (!controller.signal.aborted) setChanges(body.data);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [eventId, revision]);

  function refresh() {
    setChanges(null);
    setError(false);
    setRevision(current => current + 1);
  }

  return <div className="module-section-stack">
    <div className="section-heading">
      <div><h4>Lifecycle history</h4></div>
      <button className="secondary-button" type="button" onClick={refresh} disabled={!changes && !error}>Refresh history</button>
    </div>
    {error && <p role="alert">Unable to load quality event history.</p>}
    {!changes && !error && <p role="status">Loading lifecycle history…</p>}
    {changes?.length === 0 && <p>No lifecycle changes recorded.</p>}
    {changes && changes.length > 0 && <div className="table-wrap"><table aria-label="Lifecycle history">
      <thead><tr><th>Change</th><th>Previous value</th><th>New value</th><th>Reason</th><th>Changed by</th><th>Recorded at</th></tr></thead>
      <tbody>{changes.map(change => <tr key={change.id}>
        <td>{changeLabels[change.kind]}</td>
        <td>{changeValue(change.kind, change.fromValue, change.fromOwnerName)}</td>
        <td>{changeValue(change.kind, change.toValue, change.toOwnerName)}</td>
        <td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{change.reason}</td>
        <td>{change.actorName || "Recorded user"}</td>
        <td><time dateTime={change.createdAt}>{change.createdAt.slice(0, 10)} {change.createdAt.slice(11, 19)} UTC</time></td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
