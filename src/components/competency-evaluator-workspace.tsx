"use client";

import { useEffect, useState, type FormEvent } from "react";
import { GovernedEvidenceFilePicker } from "./governed-evidence-file-picker";

type EvaluatorView = {
  requiresAuthorizedEvaluator: boolean;
  authorizations: { id: string; label: string; basis: string; eligible: boolean }[];
  candidates: { id: string; label: string }[];
};

const endpoint = "/api/training/competency/evaluators";

export function CompetencyEvaluatorWorkspace({ programs }: {
  programs: { id: string; code: string; title: string }[];
}) {
  const [programId, setProgramId] = useState("");

  return <div className="module-section-stack">
    <div className="section-heading"><div>
      <h3>Evaluator authorization</h3>
      <p>Require a documented evaluator designation for a competency program.</p>
    </div></div>
    <label>Program
      <select value={programId} onChange={(event) => setProgramId(event.target.value)}>
        <option value="">Select a program</option>
        {programs.map((program) => <option key={program.id} value={program.id}>{program.code} · {program.title}</option>)}
      </select>
    </label>
    {programId && <ProgramEvaluators key={programId} programId={programId} />}
  </div>;
}

function ProgramEvaluators({ programId }: { programId: string }) {
  const [view, setView] = useState<EvaluatorView>();
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [formVersion, setFormVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${endpoint}?programId=${encodeURIComponent(programId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load evaluator authorizations.");
        const body = await response.json() as { data: EvaluatorView };
        if (!controller.signal.aborted) setView(body.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setNotice("Unable to load evaluator authorizations. Refresh to retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [programId, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>, operation: "AUTHORIZE" | "REVOKE") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = operation === "AUTHORIZE"
      ? { employeeId: form.get("employeeId"), basis: form.get("basis"), fileId: form.get("fileId") }
      : { authorizationId: revokeId, reason: form.get("reason") };
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, programId, ...input }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setNotice(result?.error ?? "Unable to save the evaluator change.");
        return;
      }
      setRevokeId("");
      setFormVersion((version) => version + 1);
      setNotice(operation === "AUTHORIZE" ? "Evaluator authorization recorded." : "Evaluator authorization revoked.");
      setLoading(true);
      setRefresh((version) => version + 1);
    } catch {
      setNotice("The change could not be confirmed. Refresh authorizations before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="module-action-row">
      <button type="button" disabled={busy || loading} onClick={() => {
        setNotice(""); setLoading(true); setRefresh((version) => version + 1);
      }}>Refresh authorizations</button>
    </div>
    {loading && <p role="status">Loading evaluator authorizations…</p>}
    {notice && <p role="status">{notice}</p>}
    {view && <>
      <p>{view.requiresAuthorizedEvaluator
        ? "This program requires an active evaluator authorization to record assessments."
        : "Authorizing the first evaluator restricts new assessments to authorized evaluators."}</p>
      <h4>Evaluator designations</h4>
      {view.authorizations.length ? <ul>
        {view.authorizations.map((entry) => <li key={entry.id}>
          {entry.label} · {entry.basis}{entry.eligible ? "" : " · Linked employee or account ineligible"}{" "}
          <button type="button" disabled={busy || loading} onClick={() => setRevokeId(entry.id)}>Revoke</button>
          {revokeId === entry.id && <form className="admin-form" onSubmit={(event) => void submit(event, "REVOKE")}>
            <label>Revocation reason<input name="reason" required maxLength={1000} /></label>
            <button type="submit" disabled={busy || loading}>Confirm revocation</button>
            <button type="button" disabled={busy} onClick={() => setRevokeId("")}>Cancel</button>
          </form>}
        </li>)}
      </ul> : <p>No active evaluator designations.</p>}
      <h4>Authorize an evaluator</h4>
      {view.candidates.length ? <form key={formVersion} className="admin-form" onSubmit={(event) => void submit(event, "AUTHORIZE")}>
        <label>Evaluator<select name="employeeId" defaultValue="" required>
          <option value="">Select an employee with an active account</option>
          {view.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select></label>
        <label>Qualification and delegation basis<textarea name="basis" maxLength={1000} required /></label>
        <p>Choose the available file that documents the written authorization.</p>
        <GovernedEvidenceFilePicker domain="training" disabled={busy || loading} />
        <button type="submit" disabled={busy || loading}>Authorize evaluator</button>
      </form> : <p>Link an active employee to an active user account to designate an evaluator.</p>}
    </>}
  </>;
}
