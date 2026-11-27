"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { QualityClosureReadiness as Readiness } from "@/lib/quality/closure";

export function QualityClosureReadiness({ eventId, canManage, children }: {
  eventId: string;
  canManage: boolean;
  children: ReactNode;
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/quality/events/${eventId}/closure/readiness`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Unable to load closure prerequisites");
      const body: { data: Readiness } = await response.json();
      if (!controller.signal.aborted) setReadiness(body.data);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Unable to load closure prerequisites.");
    });
    return () => controller.abort();
  }, [eventId, revision]);

  function refresh() {
    setReadiness(null);
    setError("");
    setRevision(current => current + 1);
  }

  const ready = readiness?.status === "VERIFICATION" && readiness.hasInvestigation &&
    readiness.totalActions > 0 && readiness.openActions === 0 && readiness.completedWithoutPass === 0;

  return <>
    {error && <p role="alert">{error}</p>}
    {!readiness && !error && <p role="status">Checking closure prerequisites…</p>}
    {readiness && <>
      <ul>
        <li>{readiness.status === "VERIFICATION" ? "Event in verification" : `Event must reach verification. Current status: ${readiness.status.replaceAll("_", " ").toLowerCase()}.`}</li>
        <li>{readiness.hasInvestigation ? "Investigation evidence recorded" : "Record investigation evidence."}</li>
        <li>{readiness.totalActions
          ? `${readiness.totalActions - readiness.openActions} of ${readiness.totalActions} CAPA actions completed`
          : "Record at least one CAPA action."}</li>
        <li>{readiness.totalActions - readiness.openActions - readiness.completedWithoutPass} of {readiness.totalActions} CAPA actions have a passing effectiveness check</li>
      </ul>
      {ready && <p role="status">{canManage ? "Prerequisites met. Review the signature statement to close the event." : "Closure prerequisites met."}</p>}
    </>}
    <div><button type="button" className="secondary-button" onClick={refresh} disabled={!readiness && !error}>Refresh prerequisites</button></div>
    {ready && canManage && children}
  </>;
}
