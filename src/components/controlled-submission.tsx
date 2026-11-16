"use client";

import { useEffect, useState, type FormEvent } from "react";

type DraftRow = {
  id: string;
  documentNumber: string;
  title: string;
  revisionLabel: string;
};
type DraftPage = { items: DraftRow[] };
type Reviewer = { id: string; name: string };
type Detail = {
  selected: { id: string; lockVersion: number };
  reviewers: Reviewer[];
};
type Approver = { id: string; name: string };
type ApprovalQueue = { approvers: Approver[] };
type Stage = { reviewerUserId: string; dueAt: string };

export function ControlledSubmission() {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [stages, setStages] = useState<Stage[]>([
    { reviewerUserId: "", dueAt: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDirectApproval, setConfirmDirectApproval] = useState(false);

  async function loadDetail(versionId: string) {
    setDetail(null);
    if (!versionId) return;
    const response = await fetch(`/api/documents/${versionId}`, {
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error || "Unable to load the draft submission details.");
      return;
    }
    setDetail(body.data as Detail);
  }

  async function load(preferredDocumentNumber?: string) {
    setBusy(true);
    setError("");
    const [draftResponse, approverResponse] = await Promise.all([
      fetch("/api/documents?status=DRAFT&limit=50", { credentials: "same-origin" }),
      fetch("/api/documents/approval-assignment", { credentials: "same-origin" }),
    ]);
    const draftBody = await draftResponse.json().catch(() => null);
    const approverBody = await approverResponse.json().catch(() => null);
    setBusy(false);
    if (!draftResponse.ok) {
      setError(draftBody?.error || "Unable to load draft documents.");
      return;
    }
    if (!approverResponse.ok) {
      setError(
        approverResponse.status === 403
          ? "Controlled submission requires review-management access."
          : approverBody?.error || "Unable to load eligible approvers.",
      );
      return;
    }
    const nextDrafts = (draftBody.data as DraftPage).items;
    setDrafts(nextDrafts);
    setApprovers((approverBody.data as ApprovalQueue).approvers);
    const first = nextDrafts.find((draft) => draft.documentNumber === preferredDocumentNumber)?.id || nextDrafts[0]?.id || "";
    setSelectedId(first);
    await loadDetail(first);
  }

  async function openPanel(preferredDocumentNumber?: string) {
    setOpen(true);
    setNotice("");
    setStages([{ reviewerUserId: "", dueAt: "" }]);
    setConfirmDirectApproval(false);
    await load(preferredDocumentNumber);
  }

  useEffect(() => {
    function handleCreatedDraft(event: Event) {
      const documentNumber = (event as CustomEvent<{ documentNumber?: string }>).detail?.documentNumber;
      void openPanel(documentNumber);
    }
    window.addEventListener("trace-qms:open-controlled-submission", handleCreatedDraft);
    return () => window.removeEventListener("trace-qms:open-controlled-submission", handleCreatedDraft);
    // The event is dispatched only after the document creation command succeeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateStage(index: number, patch: Partial<Stage>) {
    setStages((current) =>
      current.map((stage, position) =>
        position === index ? { ...stage, ...patch } : stage,
      ),
    );
  }

  function addStage() {
    if (stages.length >= 10) return;
    setStages((current) => [...current, { reviewerUserId: "", dueAt: "" }]);
  }

  function removeStage(index: number) {
    setStages((current) => current.filter((_, position) => position !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || busy) return;
    const form = new FormData(event.currentTarget);
    const approverUserId = String(form.get("approverUserId"));
    const comment = String(form.get("comment"));
    const populated = stages.filter(
      (stage) => stage.reviewerUserId.trim() || stage.dueAt.trim(),
    );
    if (
      populated.some((stage) => !stage.reviewerUserId.trim() || !stage.dueAt.trim())
    ) {
      setError("Each review stage requires both a reviewer and due date.");
      return;
    }
    if (populated.length === 0 && !confirmDirectApproval) {
      setError("Select a reviewer and due date, or explicitly confirm that this revision should bypass technical review.");
      return;
    }
    const reviewerIds = populated.map((stage) => stage.reviewerUserId);
    if (new Set(reviewerIds).size !== reviewerIds.length) {
      setError("Reviewers must be unique across ordered stages.");
      return;
    }
    if (reviewerIds.includes(approverUserId)) {
      setError("The final approver must be different from every reviewer.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/documents/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "TRANSITION",
        versionId: detail.selected.id,
        command: "SUBMIT",
        expectedLockVersion: detail.selected.lockVersion,
        approverUserId,
        ...(populated.length
          ? {
              reviewStages: populated.map((stage) => ({
                reviewerUserId: stage.reviewerUserId,
                dueAt: new Date(`${stage.dueAt}T23:59:59`).toISOString(),
              })),
            }
          : {}),
        comment,
      }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error || "The controlled submission could not be completed.");
      return;
    }
    setNotice(
      populated.length
        ? "Revision submitted with ordered review stages and a preassigned final approver."
        : "Revision submitted directly to final approval without a technical reviewer, as confirmed.",
    );
    await load();
  }

  return (
    <>
      <button
        type="button"
        style={{ position: "fixed", right: 390, bottom: 24, zIndex: 80 }}
        onClick={() => void openPanel()}
      >
        Controlled submission
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="controlled-submission-title"
          >
            <div className="modal-head">
              <div>
                <h2 id="controlled-submission-title">Controlled submission</h2>
                <p>Establish ordered reviewers and the final approver before review begins.</p>
              </div>
              <button aria-label="Close controlled submission" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="detail-body">
              {notice && <div className="notice" role="status"><span>{notice}</span></div>}
              {error && <div className="detail-error" role="alert">{error}</div>}
              {busy && !drafts.length && <p>Loading controlled submission data…</p>}
              {!busy && drafts.length === 0 && (
                <div className="permission-state">
                  <strong>No draft revisions available</strong>
                  <span>Create or revise a controlled document before submission.</span>
                </div>
              )}
              {drafts.length > 0 && detail && (
                <form className="approval-box" onSubmit={submit}>
                  <label>
                    Draft revision
                    <select
                      value={selectedId}
                      onChange={async (event) => {
                        const value = event.target.value;
                        setSelectedId(value);
                        setError("");
                        await loadDetail(value);
                      }}
                      required
                    >
                      {drafts.map((draft) => (
                        <option key={draft.id} value={draft.id}>
                          {draft.documentNumber} · v{draft.revisionLabel} · {draft.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <strong>Ordered review stages</strong>
                    <small>Select a reviewer and due date for each stage. Direct-to-approval routing requires explicit confirmation below.</small>
                  </div>
                  {stages.map((stage, index) => (
                    <div key={`review-stage-${index}`} className="approval-box">
                      <strong>Stage {index + 1}</strong>
                      <label>
                        Reviewer
                        <select
                          value={stage.reviewerUserId}
                          onChange={(event) =>
                            updateStage(index, { reviewerUserId: event.target.value })
                          }
                        >
                          <option value="">No reviewer</option>
                          {detail.reviewers.map((reviewer) => (
                            <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Due date
                        <input
                          type="date"
                          value={stage.dueAt}
                          onChange={(event) => updateStage(index, { dueAt: event.target.value })}
                        />
                      </label>
                      {stages.length > 1 && (
                        <button type="button" onClick={() => removeStage(index)}>Remove stage</button>
                      )}
                    </div>
                  ))}
                  <button type="button" disabled={busy || stages.length >= 10} onClick={addStage}>Add review stage</button>
                  {stages.every((stage) => !stage.reviewerUserId && !stage.dueAt) && (
                    <label>
                      <input type="checkbox" checked={confirmDirectApproval} onChange={(event) => setConfirmDirectApproval(event.target.checked)} />
                      I confirm this revision should go directly to final approval without technical review.
                    </label>
                  )}
                  <label>
                    Final approver
                    <select name="approverUserId" required defaultValue="">
                      <option value="" disabled>Select an eligible approver</option>
                      {approvers.map((approver) => (
                        <option key={approver.id} value={approver.id}>{approver.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Submission comment
                    <textarea name="comment" maxLength={4000} required />
                  </label>
                  <button className="primary-button" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit controlled revision"}</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
