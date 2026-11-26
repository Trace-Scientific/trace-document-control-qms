"use client";

import { useEffect, useState, type FormEvent } from "react";

type RemediationView = {
  remediation: {
    plan: string;
    dueOn: string | null;
    closedAt: string | null;
    followUpAssessedAt: string | null;
    resolution: string | null;
  } | null;
  eligibleFollowUp: { id: string; assessedAt: string } | null;
};

export function CompetencyRemediationPanel({ assessmentId, canManage, today }: {
  assessmentId: string;
  canManage: boolean;
  today: string;
}) {
  const [view, setView] = useState<RemediationView>();
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const endpoint = `/api/training/competency/assessments/${encodeURIComponent(assessmentId)}/remediation`;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load remediation.");
      const { data } = await response.json() as { data: RemediationView };
      if (!controller.signal.aborted) setView(data);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadFailed(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [endpoint, revision]);

  function refresh() {
    setLoadFailed(false);
    setLoading(true);
    setRevision((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>, operation: "OPEN" | "CLOSE") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = operation === "OPEN"
      ? { plan: form.get("plan"), dueOn: form.get("dueOn") || null }
      : { followUpAssessmentId: view?.eligibleFollowUp?.id, resolution: form.get("resolution") };
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, ...input }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setNotice(result?.error ?? "Unable to save the remediation change.");
        return;
      }
      setNotice(operation === "OPEN" ? "Remediation plan recorded." : "Remediation plan closed.");
      refresh();
    } catch {
      setNotice("The change could not be confirmed. Refresh the plan before retrying.");
    } finally {
      setSaving(false);
    }
  }

  const plan = view?.remediation;
  const result = view?.eligibleFollowUp;
  const disabled = saving || loading || loadFailed;

  return <section className="module-section-stack">
    <div className="module-action-row">
      <h4>Remediation</h4>
      <button type="button" disabled={saving || loading} onClick={refresh}>Refresh remediation</button>
    </div>
    {loading && <p role="status">Loading remediation…</p>}
    {loadFailed && <p role="status">Remediation could not be loaded. Refresh to retry.</p>}
    {notice && <p role="status">{notice}</p>}
    {plan ? <>
      <p><strong>{plan.closedAt ? "Closed" : plan.dueOn && plan.dueOn < today ? "Open · Past due" : "Open"}</strong>
        {plan.dueOn && <> · Due <time dateTime={plan.dueOn}>{plan.dueOn}</time></>}
      </p>
      <p>{plan.plan}</p>
      {plan.closedAt ? <>
        <p>Qualified follow-up · {plan.followUpAssessedAt && new Date(plan.followUpAssessedAt).toLocaleString()}</p>
        <p>Closed · {new Date(plan.closedAt).toLocaleString()}</p>
        <p>{plan.resolution}</p>
      </> : canManage && (result ? <form className="admin-form" onSubmit={(event) => void submit(event, "CLOSE")}>
        <p>Qualified follow-up · {new Date(result.assessedAt).toLocaleString()}</p>
        <label>Resolution<textarea name="resolution" maxLength={2000} required /></label>
        <button type="submit" disabled={disabled}>Close remediation plan</button>
      </form> : <p>Record a qualifying reassessment before closing this plan.</p>)}
    </> : view && (canManage ? <form className="admin-form" onSubmit={(event) => void submit(event, "OPEN")}>
      <label>Corrective actions<textarea name="plan" maxLength={2000} required /></label>
      <label>Follow-up due<input name="dueOn" type="date" /></label>
      <button type="submit" disabled={disabled}>Open remediation plan</button>
    </form> : <p>No remediation plan recorded.</p>)}
  </section>;
}
