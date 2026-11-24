"use client";

import { useState, type FormEvent } from "react";

type Audience = { id: string; name: string; memberCount: number };
type DocumentOption = { versionId: string; documentNumber: string; title: string; revisionLabel: string };
type Options = { sites: Audience[]; departments: Audience[]; documents: DocumentOption[] };

export function OrganizationalAcknowledgmentDistribution() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [audienceType, setAudienceType] = useState<"SITE" | "DEPARTMENT">("SITE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true); setError("");
    const response = await fetch("/api/documents/acknowledgment-organizational-audience", { credentials: "same-origin" }).catch(() => null);
    if (!response) {
      setBusy(false);
      setError("Unable to reach the server. Check your connection and try again.");
      return;
    }
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { setOptions(null); setError(response.status === 403 ? "Acknowledgment distribution requires document-distribution access." : body?.error || "Unable to load organizational audiences."); return; }
    setOptions(body.data as Options);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    const response = await fetch("/api/documents/acknowledgment-organizational-audience", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audienceType, audienceId: String(form.get("audienceId")), versionId: String(form.get("versionId")), dueAt: String(form.get("dueAt")) }) }).catch(() => null);
    if (!response) {
      setBusy(false);
      setError("Unable to reach the server. Check your connection and try again.");
      return;
    }
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { setError(body?.error || "Unable to assign organizational audience."); return; }
    setNotice(`Created ${body.data.created} assignments; ${body.data.skippedExisting} users were already assigned this version.`);
  }

  const audiences = audienceType === "SITE" ? options?.sites ?? [] : options?.departments ?? [];
  return <>
    <button type="button" style={{ position: "fixed", right: 1050, bottom: 24, zIndex: 80 }} onClick={async () => { setOpen(true); setNotice(""); await load(); }}>Site/department distribution</button>
    {open && <div className="modal-backdrop" role="presentation"><div className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="org-ack-title">
      <div className="modal-head"><div><h2 id="org-ack-title">Site / department acknowledgment distribution</h2><p>Assign an exact effective version to active acknowledgment-enabled members of an authoritative organizational audience.</p></div><button aria-label="Close organizational distribution" onClick={() => setOpen(false)}>×</button></div>
      <div className="detail-body">{notice && <div className="notice" role="status"><span>{notice}</span></div>}{error && <div className="detail-error" role="alert">{error}</div>}
      {busy && !options && <p role="status">Loading organizational audiences…</p>}
      {options && <form className="approval-box" onSubmit={submit}>
        <label>Effective document version<select name="versionId" required defaultValue=""><option value="" disabled>Select an effective version</option>{options.documents.map((doc) => <option key={doc.versionId} value={doc.versionId}>{doc.documentNumber} · v{doc.revisionLabel} · {doc.title}</option>)}</select></label>
        <label>Audience type<select value={audienceType} onChange={(event) => setAudienceType(event.target.value as "SITE" | "DEPARTMENT")}><option value="SITE">Site</option><option value="DEPARTMENT">Department</option></select></label>
        <label>{audienceType === "SITE" ? "Site" : "Department"}<select key={audienceType} name="audienceId" required defaultValue=""><option value="" disabled>Select audience</option>{audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name} · {audience.memberCount} eligible member{audience.memberCount === 1 ? "" : "s"}</option>)}</select></label>
        <label>Due date<input name="dueAt" type="datetime-local" required /></label>
        <button className="primary-button" type="submit" disabled={busy || !audiences.length || !options.documents.length}>Assign audience</button>
      </form>}</div>
    </div></div>}
  </>;
}
