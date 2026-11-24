"use client";

import { useState, type FormEvent } from "react";

type Role = { id: string; name: string; memberCount: number };
type DocumentOption = { versionId: string; documentNumber: string; title: string; revisionLabel: string };
type Options = { roles: Role[]; documents: DocumentOption[] };

export function AcknowledgmentDistribution() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/documents/acknowledgment-role-audience", { credentials: "same-origin" }).catch(() => null);
    if (!response) {
      setBusy(false);
      setError("Unable to reach the server. Check your connection and try again.");
      return;
    }
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setOptions(null);
      setError(response.status === 403 ? "Acknowledgment distribution requires document-distribution access." : body?.error || "Unable to load distribution options.");
      return;
    }
    setOptions(body.data as Options);
  }

  async function openPanel() {
    setOpen(true);
    setNotice("");
    await load();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/documents/acknowledgment-role-audience", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roleId: String(form.get("roleId")),
        versionId: String(form.get("versionId")),
        dueAt: String(form.get("dueAt")),
      }),
    }).catch(() => null);
    if (!response) {
      setBusy(false);
      setError("Unable to reach the server. Check your connection and try again.");
      return;
    }
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error || "Unable to assign the acknowledgment audience.");
      return;
    }
    setNotice(`Created ${body.data.created} assignments; ${body.data.skippedExisting} users were already assigned this version.`);
  }

  return (
    <>
      <button type="button" style={{ position: "fixed", right: 630, bottom: 24, zIndex: 80 }} onClick={openPanel}>
        Acknowledgment distribution
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="ack-distribution-title">
            <div className="modal-head">
              <div>
                <h2 id="ack-distribution-title">Acknowledgment distribution</h2>
                <p>Assign an exact effective version to all active members of an acknowledgment-enabled role.</p>
              </div>
              <button aria-label="Close acknowledgment distribution" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="detail-body">
              {notice && <div className="notice" role="status"><span>{notice}</span></div>}
              {error && <div className="detail-error" role="alert">{error}</div>}
              {busy && !options && <p>Loading distribution options…</p>}
              {options && (
                <form className="approval-box" onSubmit={submit}>
                  <label>
                    Effective document version
                    <select name="versionId" required defaultValue="">
                      <option value="" disabled>Select an effective version</option>
                      {options.documents.map((doc) => <option key={doc.versionId} value={doc.versionId}>{doc.documentNumber} · v{doc.revisionLabel} · {doc.title}</option>)}
                    </select>
                  </label>
                  <label>
                    Role audience
                    <select name="roleId" required defaultValue="">
                      <option value="" disabled>Select a role</option>
                      {options.roles.map((role) => <option key={role.id} value={role.id}>{role.name} · {role.memberCount} active member{role.memberCount === 1 ? "" : "s"}</option>)}
                    </select>
                  </label>
                  <label>
                    Due date
                    <input name="dueAt" type="datetime-local" required />
                  </label>
                  <button className="primary-button" type="submit" disabled={busy || !options.roles.length || !options.documents.length}>Assign role audience</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
