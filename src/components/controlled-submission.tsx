"use client";

import { useEffect, useState, type FormEvent } from "react";
import { buildSubmissionReceipt } from "../lib/documents/submission-receipt";
import { suggestPriorReviewers } from "../lib/documents/prior-review-routing";

type DraftRow = {
  id: string;
  documentNumber: string;
  title: string;
  revisionLabel: string;
};
type DraftPage = { items: DraftRow[] };
type Reviewer = { id: string; name: string };
type Detail = {
  selected: { id: string; lockVersion: number; status: string; documentNumber: string; title: string; revisionLabel: string };
  reviewers: Reviewer[];
  versions: { id: string; versionNumber: number }[];
  assignments: { versionId: string; stepKey: string; assignee: { id: string; name: string } | null }[];
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
  const [approverId, setApproverId] = useState("");
  const [routingNotice, setRoutingNotice] = useState("");
  const [stages, setStages] = useState<Stage[]>([
    { reviewerUserId: "", dueAt: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ReturnType<typeof buildSubmissionReceipt> | null>(null);
  const [confirmDirectApproval, setConfirmDirectApproval] = useState(false);

  async function loadDetail(versionId: string, eligibleApprovers: Approver[] = approvers) {
    setDetail(null);
    setRoutingNotice("");
    setApproverId("");
    setConfirmDirectApproval(false);
    setError("");
    setStages([{ reviewerUserId: "", dueAt: "" }]);
    if (!versionId) return;
    const response = await fetch(`/api/documents/${versionId}`, {
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error || "Unable to load the draft submission details.");
      return;
    }
    const next = body.data as Detail;
    setDetail(next);
    const previous = next.versions.filter((v) => v.id !== next.selected.id)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (!previous) return;
    const tasks = next.assignments.filter((task) => task.versionId === previous.id);
    const previousReviewerIds = suggestPriorReviewers(tasks, next.reviewers);
    const approver = tasks.find((task) => task.stepKey === "APPROVAL" &&
      task.assignee && eligibleApprovers.some((user) => user.id === task.assignee?.id))?.assignee;
    if (previousReviewerIds?.length) {
      setStages(previousReviewerIds.map((reviewerUserId) => ({ reviewerUserId, dueAt: "" })));
    }
    if (approver) setApproverId(approver.id);
    if (previousReviewerIds === null) {
      setRoutingNotice("The prior review route could not be reused. Select reviewers and due dates for this revision.");
    } else if (previousReviewerIds.length || approver) {
      setRoutingNotice("Prior-revision assignments suggested. Confirm the assignments and enter new review due dates.");
    }
  }

  async function load(preferredDocumentNumber?: string, preferredVersionId?: string) {
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
    // A newly created draft might not be in the first page of 50 results.
    // Fetch only the explicitly requested version, and never substitute a different draft.
    if (preferredVersionId && !nextDrafts.some((draft) => draft.id === preferredVersionId)) {
      const exactResponse = await fetch(`/api/documents/${preferredVersionId}`, {
        credentials: "same-origin",
      });
      const exactBody = await exactResponse.json().catch(() => null);
      if (!exactResponse.ok || exactBody?.data?.selected?.status !== "DRAFT") {
        setError(exactBody?.error || "The requested draft is no longer available for submission.");
        setDrafts([]);
        return;
      }
      const selected = exactBody.data.selected as Detail["selected"];
      nextDrafts.unshift({
        id: selected.id,
        documentNumber: selected.documentNumber,
        title: selected.title,
        revisionLabel: selected.revisionLabel,
      });
    }
    setDrafts(nextDrafts);
    setApprovers((approverBody.data as ApprovalQueue).approvers);
    const first = nextDrafts.find((draft) => draft.id === preferredVersionId)?.id || nextDrafts.find((draft) => draft.documentNumber === preferredDocumentNumber)?.id || nextDrafts[0]?.id || "";
    setSelectedId(first);
    await loadDetail(first, (approverBody.data as ApprovalQueue).approvers);
  }

  async function openPanel(preferredDocumentNumber?: string, preferredVersionId?: string) {
    setOpen(true);
    setReceipt(null);
    setDetail(null);
    setDrafts([]);
    setStages([{ reviewerUserId: "", dueAt: "" }]);
    setConfirmDirectApproval(false);
    await load(preferredDocumentNumber, preferredVersionId);
  }

  useEffect(() => {
    function handleCreatedDraft(event: Event) {
      const documentNumber = (event as CustomEvent<{ documentNumber?: string; versionId?: string }>).detail?.documentNumber;
      const versionId = (event as CustomEvent<{ versionId?: string }>).detail?.versionId;
      void openPanel(documentNumber, versionId);
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
    setReceipt(buildSubmissionReceipt({
      revision: detail.selected,
      firstReviewerId: populated[0]?.reviewerUserId,
      reviewers: detail.reviewers,
      approverId: approverUserId,
      approvers,
      stageCount: populated.length,
    }));
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
                {!receipt && <p>Establish ordered reviewers and the final approver before review begins.</p>}
              </div>
              <button aria-label="Close controlled submission" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="detail-body">
              {receipt && (
                <>
                  <div className="notice" role="status">
                    <strong>Revision submitted</strong>
                    <p>{receipt.revision}</p>
                    <p>
                      Next step · {receipt.nextStep}
                      {receipt.nextAssignee && ` · ${receipt.nextAssignee}`}
                    </p>
                    {receipt.laterApprover && (
                      <p>Final approval after {receipt.stageCount === 1 ? "technical review" : `${receipt.stageCount} review stages`} · {receipt.laterApprover}</p>
                    )}
                  </div>
                  <button type="button" onClick={() => void openPanel()}>Submit another revision</button>
                </>
              )}
              {!receipt && error && <div className="detail-error" role="alert">{error}</div>}
              {!receipt && routingNotice && <div className="notice" role="status">{routingNotice}</div>}
              {!receipt && busy && !drafts.length && <p>Loading controlled submission data…</p>}
              {!receipt && !busy && drafts.length === 0 && (
                <div className="permission-state">
                  <strong>No draft revisions available</strong>
                  <span>Create or revise a controlled document before submission.</span>
                </div>
              )}
              {!receipt && drafts.length > 0 && detail && (
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
                    <select name="approverUserId" required value={approverId} onChange={(event) => setApproverId(event.target.value)}>
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

