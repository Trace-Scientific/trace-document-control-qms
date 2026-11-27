"use client";

import { useEffect, useState } from "react";
import type { QualityEventIntake } from "@/lib/quality/events";

type Intake = Omit<QualityEventIntake, "createdAt" | "discoveredAt"> & {
  createdAt: string;
  discoveredAt: string;
};

function RecordedTime({ value }: { value: string }) {
  return <time dateTime={value}>{value.slice(0, 10)} {value.slice(11, 19)} UTC</time>;
}

export function QualityEventOriginalReport({ eventId }: { eventId: string }) {
  const [report, setReport] = useState<Intake | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/quality/events/${eventId}`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Unable to load the original quality event report");
      const { data }: { data: Intake } = await response.json();
      if (!data) throw new Error("Missing quality event report");
      if (!controller.signal.aborted) setReport(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [eventId]);

  return <div className="module-section-stack">
    <h4>Original event report</h4>
    {error && <p role="alert">Unable to load the original quality event report.</p>}
    {!error && !report && <p role="status">Loading the original report…</p>}
    {report && <dl className="quality-record-details">
      <dt>Type and severity</dt>
      <dd>{report.type.replaceAll("_", " ")} · {report.severity}</dd>
      <dt>Source</dt>
      <dd>{report.source === "SYSTEM" ? "System-generated" : "Manually reported"}</dd>
      <dt>Recorded by</dt>
      <dd>{report.reporterName || "Recorded user"}</dd>
      <dt>Discovered at</dt>
      <dd><RecordedTime value={report.discoveredAt} /></dd>
      <dt>Recorded at</dt>
      <dd><RecordedTime value={report.createdAt} /></dd>
      <dt>Description</dt>
      <dd>{report.description ?? "No description recorded."}</dd>
    </dl>}
  </div>;
}
