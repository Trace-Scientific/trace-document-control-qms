"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import styles from "./governed-evidence-file-picker.module.css";

type EvidenceFile = {
  id: string;
  originalName: string;
  sha256: string;
  status: string;
};
type EvidenceDomain = "personnel" | "training" | "quality" | "equipment";

const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.tif,.tiff,.txt,.csv";
const SCAN_REFRESH_MS = 15_000;
const MAX_SCAN_REFRESHES = 10;

export function watchEvidenceFiles(
  endpoint: string,
  uploadedId: string | undefined,
  onFiles: (files: EvidenceFile[]) => void,
  onStop: () => void,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remaining = MAX_SCAN_REFRESHES;
  let pending = Boolean(uploadedId);

  async function refresh() {
    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        if (!controller.signal.aborted) onStop();
        return;
      }
      if (response.ok) {
        const { data }: { data: EvidenceFile[] } = await response.json();
        if (controller.signal.aborted) return;
        onFiles(data);
        pending = data.some((file) => file.status === "PENDING_SCAN")
          || Boolean(uploadedId && !data.some((file) => file.id === uploadedId));
      }
    } catch {
      // Keep the last successful list visible during temporary read failures.
    }

    if (controller.signal.aborted || !pending) return;
    if (remaining === 0) {
      onStop();
      return;
    }
    remaining -= 1;
    timer = setTimeout(() => void refresh(), SCAN_REFRESH_MS);
  }

  void refresh();
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}

export function GovernedEvidenceFilePicker({
  name = "fileId",
  disabled = false,
  domain = "personnel",
  onSelectionChange,
}: {
  name?: string;
  disabled?: boolean;
  domain?: EvidenceDomain;
  onSelectionChange?: (fileId: string) => void;
}) {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [selected, setSelected] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ id: string; name: string }>();
  const [scanChecksStopped, setScanChecksStopped] = useState(false);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const endpoint = `/api/evidence-files?domain=${domain}`;

  useEffect(() => {
    return watchEvidenceFiles(endpoint, uploadedFile?.id, setFiles, () => setScanChecksStopped(true));
  }, [endpoint, uploadedFile, refreshRequest]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");
    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch(endpoint, { method: "POST", body: form, credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.data?.id !== "string") {
        setUploadError(body?.error ?? "Evidence file could not be uploaded.");
        return;
      }
      setScanChecksStopped(false);
      setUploadedFile({ id: body.data.id, name: file.name });
    } catch {
      setUploadError("The upload could not be confirmed. Check the file list before uploading again.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  const available = files.filter((file) => file.status === "AVAILABLE");
  const pending = files.filter((file) => file.status === "PENDING_SCAN");
  const selectedFile = available.find((file) => file.id === selected);
  const uploadedStatus = files.find((file) => file.id === uploadedFile?.id)?.status;
  const awaitingUpload = uploadedFile && (!uploadedStatus || uploadedStatus === "PENDING_SCAN");

  return (
    <fieldset className={styles.panel} disabled={disabled}>
      <legend>Supporting evidence</legend>
      <p className={styles.intro}>Attach an existing approved file or upload a new supporting document.</p>
      <label className={styles.field}>
        <span>Select existing file</span>
        <select
          name={name}
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            onSelectionChange?.(event.target.value);
          }}
          disabled={disabled}
        >
          <option value="">No evidence file attached</option>
          {available.map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}
        </select>
      </label>
      {selectedFile && (
        <div className={styles.selected} aria-live="polite">
          <strong>{selectedFile.originalName}</strong>
          <span>Available · SHA-256 {selectedFile.sha256.slice(0, 12)}…</span>
        </div>
      )}
      <div className={styles.upload}>
        <label>
          <span>Upload new file</span>
          <input type="file" accept={ACCEPTED} onChange={(event) => void upload(event)} disabled={disabled || uploading} />
        </label>
        <small>PDF, Word, Excel, JPEG, PNG, TIFF, TXT or CSV · Max 25 MB · New files are malware scanned before use.</small>
      </div>
      {pending.length > 0 && (
        <p className={styles.pending}>
          {pending.length} evidence file{pending.length === 1 ? " is" : "s are"} awaiting malware scan.
        </p>
      )}
      {uploadedFile && (
        <p className={uploadedStatus === "AVAILABLE" ? styles.notice : styles.pending} role="status">
          {uploadedStatus === "AVAILABLE"
            ? `${uploadedFile.name} passed the malware scan and is available to select.`
            : awaitingUpload
              ? `${uploadedFile.name} was uploaded and will become selectable after it passes the malware scan.`
              : `${uploadedFile.name} is unavailable for selection.`}
        </p>
      )}
      {uploadError && <p className={styles.pending} role="alert">{uploadError}</p>}
      {(scanChecksStopped || uploadError) && (
        <div className={styles.upload}>
          {scanChecksStopped && <small role="status">Automatic checks have stopped. Check scan status to refresh the file list.</small>}
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              setScanChecksStopped(false);
              setRefreshRequest((request) => request + 1);
            }}
          >
            Check scan status
          </button>
        </div>
      )}
    </fieldset>
  );
}
