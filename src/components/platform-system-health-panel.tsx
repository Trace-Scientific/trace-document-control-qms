"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type HealthState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";

type Snapshot = {
  checkedAt: string;
  overall: HealthState;
  application: { readiness: HealthState; releaseIdentity: string | null; environmentClass: string };
  database: { connectivity: HealthState; latestMigration: string | null; latestMigrationFinishedAt: string | null; failedMigrationCount: number };
  backgroundJobs: { notificationDelivery: HealthState; pending: number; retry: number; processing: number; deadLetter: number; oldestAvailableAt: string | null; staleProcessing: number };
  scheduledTasks: { status: HealthState; detail: string };
  integrations: { status: HealthState; detail: string };
};

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function State({ value }: { value: HealthState }) {
  return <span className={styles.badge}>{value.replaceAll("_", " ")}</span>;
}

export function PlatformSystemHealthPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetch("/api/platform/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("System health could not be loaded.");
        return response.json() as Promise<{ data: Snapshot }>;
      })
      .then((payload) => { if (!cancelled) setData(payload.data); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "System health could not be loaded."); });
    return () => { cancelled = true; };
  }, [refresh]);

  if (error) return <div className={styles.error}>{error}</div>;
  if (!data) return <div className={styles.notice}>Loading sanitized system health…</div>;

  return (
    <div>
      <article className={styles.card}>
        <h3>Overall platform health</h3>
        <p><State value={data.overall} /> · Checked {timestamp(data.checkedAt)}</p>
        <button type="button" className={styles.navButton} onClick={() => setRefresh((value) => value + 1)}>Refresh health</button>
      </article>
      <div className={styles.grid} style={{ marginTop: 16 }}>
        <article className={styles.card}>
          <h3>Application</h3>
          <p>Readiness: <State value={data.application.readiness} /></p>
          <p>Environment: {data.application.environmentClass.replaceAll("_", " ")}</p>
          <p>Release: {data.application.releaseIdentity ?? "Not declared"}</p>
        </article>
        <article className={styles.card}>
          <h3>Database & migrations</h3>
          <p>Connectivity: <State value={data.database.connectivity} /></p>
          <p>Latest migration: {data.database.latestMigration ?? "Unavailable"}</p>
          <p>Finished: {timestamp(data.database.latestMigrationFinishedAt)}</p>
          <p>Incomplete migrations: {data.database.failedMigrationCount}</p>
        </article>
        <article className={styles.card}>
          <h3>Notification delivery worker</h3>
          <p>Status: <State value={data.backgroundJobs.notificationDelivery} /></p>
          <p>Pending {data.backgroundJobs.pending} · Retry {data.backgroundJobs.retry} · Processing {data.backgroundJobs.processing}</p>
          <p>Dead-letter {data.backgroundJobs.deadLetter} · Stale claims {data.backgroundJobs.staleProcessing}</p>
          <p>Oldest available: {timestamp(data.backgroundJobs.oldestAvailableAt)}</p>
        </article>
        <article className={styles.card}>
          <h3>Scheduled tasks</h3>
          <p><State value={data.scheduledTasks.status} /></p>
          <p>{data.scheduledTasks.detail}</p>
        </article>
        <article className={styles.card}>
          <h3>Integrations</h3>
          <p><State value={data.integrations.status} /></p>
          <p>{data.integrations.detail}</p>
        </article>
        <article className={styles.card}>
          <h3>Sanitized view</h3>
          <p>This workspace intentionally excludes secrets, tokens, connection strings, raw environment variables, infrastructure credentials, and tenant-regulated content.</p>
        </article>
      </div>
    </div>
  );
}
