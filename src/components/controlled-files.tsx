"use client";
import { useEffect, useState, type FormEvent } from "react";

type Row = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  status: string;
  createdAt: string;
};
type DraftRow = {
  id: string;
  documentNumber: string;
  title: string;
  revisionLabel: string;
  status: string;
};

export function ControlledFiles({ canCreate }: { canCreate: boolean }) {
  const [rows, setRows] = useState<Row[]>([]),
    [drafts, setDrafts] = useState<DraftRow[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [uploading, setUploading] = useState(false),
    [attachingFileId, setAttachingFileId] = useState<string | null>(null);

  async function loadFiles() {
    const response = await fetch("/api/files");
    const body = await response.json().catch(() => null);
    if (response.ok) setRows(body.data);
    else setError(body?.error ?? "Files could not be loaded.");
  }

  async function loadDrafts() {
    const response = await fetch("/api/documents?status=DRAFT&limit=25");
    const body = await response.json().catch(() => null);
    if (response.ok) setDrafts(body.data?.items ?? []);
    else setError(body?.error ?? "Draft documents could not be loaded.");
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/files").then(async (response) => ({
        response,
        body: await response.json().catch(() => null),
      })),
      fetch("/api/documents?status=DRAFT&limit=25").then(async (response) => ({
        response,
        body: await response.json().catch(() => null),
      })),
    ]).then(([fileResult, draftResult]) => {
      if (!active) return;
      if (fileResult.response.ok) setRows(fileResult.body.data);
      else setError(fileResult.body?.error ?? "Files could not be loaded.");
      if (draftResult.response.ok) setDrafts(draftResult.body.data?.items ?? []);
      else setError(draftResult.body?.error ?? "Draft documents could not be loaded.");
    });
    return () => {
      active = false;
    };
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/files", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const body = await response.json().catch(() => null);
    setUploading(false);
    if (!response.ok) return setError(body?.error ?? "Upload failed.");
    event.currentTarget.reset();
    await loadFiles();
  }

  async function attach(event: FormEvent<HTMLFormElement>, file: Row) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const versionId = String(form.get("versionId"));
    if (!versionId) return;
    setAttachingFileId(file.id);
    setError("");
    setNotice("");

    const detailResponse = await fetch(`/api/documents/${versionId}`);
    const detailBody = await detailResponse.json().catch(() => null);
    if (!detailResponse.ok) {
      setAttachingFileId(null);
      setError(detailBody?.error ?? "The draft document could not be loaded.");
      return;
    }

    const response = await fetch(`/api/documents/${versionId}/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileId: file.id,
        expectedLockVersion: detailBody.data.selected.lockVersion,
      }),
    });
    const body = await response.json().catch(() => null);
    setAttachingFileId(null);
    if (!response.ok) {
      setError(body?.error ?? "The controlled file could not be attached.");
      return;
    }

    setNotice(
      `${file.originalName} was bound to ${detailBody.data.selected.documentNumber} v${detailBody.data.selected.revisionLabel} with audit evidence.`,
    );
    await Promise.all([loadFiles(), loadDrafts()]);
  }

  return (
    <section className="panel documents-panel">
      <div className="panel-header">
        <div>
          <h2>Private controlled files</h2>
          <p>Uploads remain unavailable until an external malware scanner reports clean</p>
        </div>
        <span className="count-pill">{rows.length}</span>
      </div>
      {canCreate && (
        <form className="file-upload" onSubmit={upload}>
          <input name="file" type="file" accept=".pdf,.docx,.xlsx,.txt" required />
          <button className="primary-button" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload file"}
          </button>
        </form>
      )}
      {notice && <div className="notice" role="status">{notice}</div>}
      {error && <div className="detail-error" role="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Status</th>
              <th>Size</th>
              <th>Integrity</th>
              {canCreate && <th>Controlled binding</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.status === "AVAILABLE" ? (
                    <a href={`/api/files/${row.id}`}>{row.originalName}</a>
                  ) : (
                    row.originalName
                  )}
                  <span>{row.mimeType}</span>
                </td>
                <td>{row.status.replaceAll("_", " ")}</td>
                <td>{Math.ceil(Number(row.sizeBytes) / 1024)} KB</td>
                <td><code>{row.sha256.slice(0, 12)}…</code></td>
                {canCreate && (
                  <td>
                    {row.status === "AVAILABLE" ? (
                      <form className="file-upload" onSubmit={(event) => attach(event, row)}>
                        <select name="versionId" required defaultValue="" aria-label={`Attach ${row.originalName} to draft`}>
                          <option value="">Select draft</option>
                          {drafts.map((draft) => (
                            <option key={draft.id} value={draft.id}>
                              {draft.documentNumber} · {draft.title} · v{draft.revisionLabel}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={attachingFileId === row.id || !drafts.length}
                        >
                          {attachingFileId === row.id ? "Attaching…" : "Attach to draft"}
                        </button>
                      </form>
                    ) : (
                      <span>Unavailable for binding</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
