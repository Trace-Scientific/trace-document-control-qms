"use client";

import { useState } from "react";

export function QualityEvidenceDownload({ eventId, fileId }: { eventId: string; fileId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/quality/events/${eventId}/evidence/${fileId}`, { credentials: "same-origin" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Supporting file could not be downloaded.");
        return;
      }

      const filename = response.headers.get("content-disposition")?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1];
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? "quality-evidence";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Supporting file could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <button type="button" className="secondary-button" onClick={() => void download()} disabled={busy}>
      {busy ? "Downloading…" : "Download supporting file"}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
