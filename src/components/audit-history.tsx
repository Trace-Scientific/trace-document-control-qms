"use client";

import { useEffect, useState, type FormEvent } from "react";

type AuditRow = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityVersion: string | null;
  previousHash: string | null;
  newHash: string | null;
  reason: string | null;
  metadata: unknown;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

type AuditPage = { items: AuditRow[]; nextCursor: string | null };

export function AuditHistory() {
  const [rows, setRows] = useState<AuditRow[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<Array<string | null>>([]),
    [filters, setFilters] = useState({ action: "", entityType: "", from: "", to: "" }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");

  async function load(nextCursorValue: string | null = cursor, nextFilters = filters) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "25" });
    if (nextCursorValue) params.set("cursor", nextCursorValue);
    if (nextFilters.action) params.set("action", nextFilters.action);
    if (nextFilters.entityType) params.set("entityType", nextFilters.entityType);
    if (nextFilters.from) params.set("from", new Date(`${nextFilters.from}T00:00:00`).toISOString());
    if (nextFilters.to) params.set("to", new Date(`${nextFilters.to}T23:59:59.999`).toISOString());
    const response = await fetch(`/api/audit?${params}`, { credentials: "same-origin" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setError(body?.error ?? "Audit history could not be loaded.");
      return;
    }
    const page = body.data as AuditPage;
    setRows(page.items);
    setNextCursor(page.nextCursor);
  }

  useEffect(() => {
    load(null, filters);
    // Initial authorized read only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = {
      action: String(form.get("action") ?? "").trim(),
      entityType: String(form.get("entityType") ?? "").trim(),
      from: String(form.get("from") ?? ""),
      to: String(form.get("to") ?? ""),
    };
    setFilters(next);
    setCursor(null);
    setHistory([]);
    load(null, next);
  }

  return (
    <section className="panel documents-panel">
      <div className="panel-header">
        <div>
          <h2>Audit history</h2>
          <p>Authorized, tenant-scoped, append-only evidence</p>
        </div>
      </div>
      <form className="toolbar" onSubmit={applyFilters}>
        <input name="action" placeholder="Action" aria-label="Audit action filter" />
        <input name="entityType" placeholder="Entity type" aria-label="Audit entity type filter" />
        <input name="from" type="date" aria-label="Audit from date" />
        <input name="to" type="date" aria-label="Audit to date" />
        <button type="submit" disabled={loading}>Apply filters</button>
      </form>
      {error && <div className="detail-error" role="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Occurred</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Reason / hashes</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.occurredAt).toLocaleString()}</td>
                <td>{row.actor ? `${row.actor.firstName} ${row.actor.lastName} · ${row.actor.email}` : "System"}</td>
                <td><code>{row.action}</code></td>
                <td>{row.entityType}{row.entityId ? ` · ${row.entityId}` : ""}{row.entityVersion ? ` · ${row.entityVersion}` : ""}</td>
                <td>
                  <span>{row.reason ?? "—"}</span>
                  {row.previousHash && <small>Previous: {row.previousHash}</small>}
                  {row.newHash && <small>New: {row.newHash}</small>}
                </td>
                <td><code>{JSON.stringify(row.metadata)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !rows.length && <div className="empty-state"><strong>No audit events found</strong><span>Adjust the filters and try again.</span></div>}
      </div>
      <div className="table-footer">
        <span>{loading ? "Loading audit history…" : `${rows.length} event${rows.length === 1 ? "" : "s"} on this page`}</span>
        <div>
          <button
            disabled={!cursor || loading}
            onClick={() => {
              const prior = [...history];
              const previous = prior.pop() ?? null;
              setHistory(prior);
              setCursor(previous);
              load(previous, filters);
            }}
          >Previous</button>
          <button
            disabled={!nextCursor || loading}
            onClick={() => {
              setHistory((items) => [...items, cursor]);
              setCursor(nextCursor);
              load(nextCursor, filters);
            }}
          >Next</button>
        </div>
      </div>
    </section>
  );
}
