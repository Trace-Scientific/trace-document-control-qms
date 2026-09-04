"use client";
import { useEffect, useState, type FormEvent } from "react";

type FileRow = { id: string; originalName: string; mimeType: string; sha256: string; status: string };
type BoundFile = { id: string; originalName: string; mimeType: string; sha256: string; status: string } | null;

export function DocumentFileAttachment({
  versionId,
  lockVersion,
  status,
  file,
  canAttach,
  onAttached,
}: {
  versionId: string;
  lockVersion: number;
  status: string;
  file: BoundFile;
  canAttach: boolean;
  onAttached: () => Promise<void>;
}) {
  const [files, setFiles] = useState<FileRow[]>([]),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (status !== "DRAFT" || file || !canAttach) return;
    let active = true;
    fetch("/api/files")
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.ok) setFiles((body.data as FileRow[]).filter((row) => row.status === "AVAILABLE"));
        else setError(body?.error ?? "Available controlled files could not be loaded.");
      });
    return () => { active = false; };
  }, [status, file, canAttach]);

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/documents/${versionId}/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: String(form.get("fileId")), expectedLockVersion: lockVersion }),
    });
    const body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) return setError(body?.error ?? "The controlled file could not be attached.");
    await onAttached();
  }

  return (
    <section className="content-card" aria-label="Controlled file attachment">
      <h3>Controlled file</h3>
      {file ? (
        <div>
          <a href={`/api/files/${file.id}`}>{file.originalName}</a>
          <p>{file.mimeType} · {file.status.replaceAll("_", " ")}</p>
          <small>SHA-256: {file.sha256.slice(0, 12)}… · Bound to this controlled revision</small>
        </div>
      ) : status === "DRAFT" && canAttach ? (
        <form className="file-upload" onSubmit={attach}>
          <label>
            Available private controlled file
            <select name="fileId" required defaultValue="">
              <option value="">Select an AVAILABLE file</option>
              {files.map((row) => <option key={row.id} value={row.id}>{row.originalName} · {row.sha256.slice(0, 12)}…</option>)}
            </select>
          </label>
          <button className="primary-button" disabled={submitting || !files.length} type="submit">
            {submitting ? "Attaching…" : "Attach controlled file"}
          </button>
          {!files.length && <small>No AVAILABLE unbound file is currently selectable.</small>}
        </form>
      ) : (
        <p>No controlled file is bound to this revision.</p>
      )}
      {error && <div className="detail-error" role="alert">{error}</div>}
    </section>
  );
}
