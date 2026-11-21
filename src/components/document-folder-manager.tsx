"use client";

import { useMemo, useState, type FormEvent } from "react";

type Folder = { id: string; parentFolderId: string | null; name: string; documentCount: number };
type DocumentRow = { documentId: string; documentNumber: string; title: string; folderId: string | null };
type Payload = { folders: Folder[]; documents: DocumentRow[] };
type ListedVersion = { id: string; documentNumber: string; title: string; revisionLabel: string; status: string; type: string };

export function DocumentFolderManager() {
  const [open, setOpen] = useState(false), [data, setData] = useState<Payload | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [parentFolderId, setParentFolderId] = useState(""), [selectedFolderId, setSelectedFolderId] = useState(""), [folderQuery, setFolderQuery] = useState(""), [folderResults, setFolderResults] = useState<ListedVersion[]>([]);

  async function load() {
    setBusy(true); setError("");
    const response = await fetch("/api/document-folders", { credentials: "same-origin" }), body = await response.json().catch(() => null);
    setBusy(false); if (!response.ok) { setError(response.status === 403 ? "Folder management requires document access." : body?.error || "Unable to load folders."); return; } setData(body.data);
  }
  async function command(payload: unknown) {
    setBusy(true); setError("");
    const response = await fetch("/api/document-folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), body = await response.json().catch(() => null);
    setBusy(false); if (!response.ok) { setError(body?.error || "Folder change could not be completed."); return false; } await load(); return true;
  }
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); if (await command({ operation: "CREATE_FOLDER", parentFolderId: parentFolderId || null, name: String(form.get("name")) })) event.currentTarget.reset(); }
  async function browse(folderId: string, query = folderQuery) {
    setSelectedFolderId(folderId); setFolderQuery(query); setError("");
    if (!folderId) { setFolderResults([]); return; }
    const params = new URLSearchParams({ folderId, limit: "100" }); if (query.trim()) params.set("query", query.trim());
    const response = await fetch(`/api/documents?${params}`, { credentials: "same-origin" }), body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.error || "Unable to browse this folder."); return; } setFolderResults(body.data.items);
  }
  const depth = useMemo(() => { const map = new Map(data?.folders.map((folder) => [folder.id, folder]) ?? []); return (folder: Folder) => { let value = 0, current = folder.parentFolderId; const seen = new Set<string>(); while (current && !seen.has(current)) { seen.add(current); value += 1; current = map.get(current)?.parentFolderId ?? null; } return value; }; }, [data]);

  return <>
    <button type="button" onClick={async () => { setOpen(true); await load(); }}>Browse document folders</button>
    {open && <div className="modal-backdrop" role="presentation"><div className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="folder-manager-title">
      <div className="modal-head"><div><h2 id="folder-manager-title">Document folders</h2><p>Create, move, browse, and safely remove folders without changing revision history.</p></div><button aria-label="Close document folders" onClick={() => setOpen(false)}>×</button></div>
      <div className="detail-body">
        {error && <div className="detail-error" role="alert">{error}</div>}
        <form className="approval-box" onSubmit={create}><label>Parent folder<select value={parentFolderId} onChange={(event) => setParentFolderId(event.target.value)}><option value="">Root</option>{data?.folders.map((folder) => <option key={folder.id} value={folder.id}>{"— ".repeat(depth(folder))}{folder.name}</option>)}</select></label><label>Folder name<input name="name" required maxLength={120} /></label><button className="primary-button" disabled={busy} type="submit">Create folder</button></form>
        {busy && !data ? <p>Loading folders…</p> : <div className="template-layout">
          <div><strong>Folder hierarchy</strong>{data?.folders.length ? data.folders.map((folder) => <div key={folder.id} style={{ paddingLeft: depth(folder) * 18, marginTop: 10 }}>
            <button type="button" aria-expanded={expandedFolderIds.includes(folder.id)} onClick={() => { setExpandedFolderIds((current) => current.includes(folder.id) ? current.filter((id) => id !== folder.id) : [...current, folder.id]); void browse(folder.id); }} style={{ marginRight: 8 }}>{expandedFolderIds.includes(folder.id) ? "▾" : "▸"} 📁 {folder.name}</button> · {folder.documentCount} document(s)
            <select aria-label={`Move ${folder.name}`} value={folder.parentFolderId ?? ""} onChange={(event) => void command({ operation: "MOVE_FOLDER", folderId: folder.id, parentFolderId: event.target.value || null })}><option value="">Root</option>{data.folders.filter((candidate) => candidate.id !== folder.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{"— ".repeat(depth(candidate))}{candidate.name}</option>)}</select>
            <button type="button" disabled={busy} onClick={() => void command({ operation: "DELETE_FOLDER", folderId: folder.id })}>Delete</button>
          </div>) : <p>No folders yet.</p>}</div>
          <div><strong>Document placement</strong>{data?.documents.map((document) => <label key={document.documentId} style={{ display: "block", marginTop: 8 }}>{document.documentNumber} · {document.title}<select value={document.folderId ?? ""} onChange={(event) => { if (event.target.value) void command({ operation: "PLACE_DOCUMENT", documentId: document.documentId, folderId: event.target.value }); }}><option value="">Unfiled</option>{data.folders.map((folder) => <option key={folder.id} value={folder.id}>{"— ".repeat(depth(folder))}{folder.name}</option>)}</select></label>)}</div>
        </div>}
        {selectedFolderId && <div className="approval-box" style={{ marginTop: 18 }}><strong>Browse selected folder</strong><label>Search within folder<input value={folderQuery} onChange={(event) => setFolderQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void browse(selectedFolderId, folderQuery); } }} /></label><button type="button" onClick={() => void browse(selectedFolderId, folderQuery)}>Search</button>{folderResults.length ? folderResults.map((row) => <div key={row.id} style={{ marginTop: 8 }}>{row.documentNumber} · {row.title} · {row.revisionLabel} · {row.status}</div>) : <p>No matching document versions in this folder.</p>}</div>}
      </div>
    </div></div>}
  </>;
}