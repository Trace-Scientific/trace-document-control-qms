"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  competencyRequirementScopes,
  type CompetencyRequirementScope,
  type CompetencyRequirementsView,
} from "@/lib/training/competency-requirements";
import { competencyRollups } from "@/lib/training/competency-rollup";

const scopeLabels: Record<CompetencyRequirementScope, string> = {
  EMPLOYEE: "Employee",
  DEPARTMENT: "Department",
  JOB: "Job role",
};

const statusLabels = {
  MISSING_INITIAL: "Missing initial assessment",
  CURRENT: "Current",
  DUE_SOON: "Due within 30 days",
  EXPIRED: "Expired",
  CONDITIONAL: "Conditional",
  NOT_QUALIFIED: "Not qualified",
};

const endpoint = "/api/training/competency/requirements";

async function fetchRequirements(signal?: AbortSignal): Promise<CompetencyRequirementsView> {
  const response = await fetch(endpoint, { credentials: "same-origin", signal });
  if (response.status === 403) throw new Error("Competency requirements need access to training and personnel records.");
  if (!response.ok) throw new Error("Unable to load competency requirements. Refresh to retry.");
  return (await response.json()).data;
}

export function CompetencyRequirementsMatrix({ canManage, programs, today, onAssess }: {
  canManage: boolean;
  programs: { id: string; code: string; title: string }[];
  today: string;
  onAssess: (employeeId: string, programId: string) => void;
}) {
  const [view, setView] = useState<CompetencyRequirementsView>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [scope, setScope] = useState<CompetencyRequirementScope>("EMPLOYEE");
  const [retiringId, setRetiringId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    const controller = new AbortController();
    void fetchRequirements(controller.signal).then((data) => {
      if (!controller.signal.aborted) {
        setView(data);
        setLoading(false);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setNotice(error instanceof Error ? error.message : "Unable to load competency requirements. Refresh to retry.");
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  async function refresh() {
    setLoading(true);
    setNotice("");
    try {
      setView(await fetchRequirements());
    } catch {
      setNotice("Unable to refresh competency requirements. The last loaded results may be out of date.");
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>, operation: "CREATE" | "RETIRE") {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = operation === "CREATE"
      ? { operation, scope, programId: values.get("programId"), targetId: values.get("targetId") }
      : { operation, requirementId: retiringId, reason: values.get("reason") };
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setNotice(result?.error ?? "Unable to save the competency requirement.");
        return;
      }
      form.reset();
      setRetiringId("");
      try {
        setView(await fetchRequirements());
        setNotice(operation === "CREATE" ? "Competency requirement added." : "Competency requirement retired.");
      } catch {
        setNotice("The change was saved. Refresh to load the updated requirements.");
      }
    } catch {
      setNotice("The save could not be confirmed. Refresh before retrying.");
    } finally {
      setSaving(false);
    }
  }

  const assessments = view?.rows.flatMap((row) => row.assessment ? [row.assessment] : []) ?? [];
  const rollups = new Map(competencyRollups(assessments, today).map((row) => [row.id, row]));
  const rows = view?.rows.map((row) => ({
    ...row,
    status: (row.assessment && rollups.get(row.assessment.id)?.status) || "MISSING_INITIAL",
  } as const)) ?? [];
  const searchWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleRows = rows.filter((row) => {
    const matchesStatus = filter === "ALL" || row.status === filter;
    const text = `${row.employeeLabel} ${row.programLabel}`.toLowerCase();
    return matchesStatus && searchWords.every((word) => text.includes(word));
  });
  const requirementsById = new Map(view?.requirements.map((requirement) => [requirement.id, requirement]) ?? []);

  return <div className="module-section-stack">
    <div className="section-heading">
      <div><h3>Competency requirements</h3><p>See who needs an initial assessment or reassessment for each required program.</p></div>
      <button type="button" disabled={loading || saving} onClick={() => void refresh()}>Refresh requirements</button>
    </div>
    {loading && <p role="status">Loading competency requirements…</p>}
    {notice && <p role="status">{notice}</p>}
    {view && <>
      <p>{rows.length} required employee–program pairs · {rows.filter((row) => row.status === "MISSING_INITIAL").length} missing initial assessment</p>
      <label>Search requirements
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee or program" />
      </label>
      <label>Assessment status
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="ALL">All statuses</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Program</th><th>Required by</th><th>Status</th><th>Expires</th>{canManage && <th>Action</th>}</tr></thead>
          <tbody>
            {visibleRows.map((row) => <tr key={`${row.employeeId}:${row.programId}`}>
              <td>{row.employeeLabel}</td><td>{row.programLabel}</td>
              <td>{row.requirementIds.map((id) => {
                const requirement = requirementsById.get(id);
                return requirement ? <div key={id}>{scopeLabels[requirement.scope]} · {requirement.targetLabel}</div> : null;
              })}</td>
              <td>{statusLabels[row.status]}</td><td>{row.assessment?.expiresAt ?? "—"}</td>
              {canManage && <td><button type="button" onClick={() => onAssess(row.employeeId, row.programId)}>
                {row.assessment ? "Reassess" : "Record initial assessment"}
              </button></td>}
            </tr>)}
            {!visibleRows.length && <tr><td colSpan={canManage ? 6 : 5}>
              {rows.length ? "No requirements match the selected filters." : "No active employees currently match a competency requirement."}
            </td></tr>}
          </tbody>
        </table>
      </div>
      {canManage && <>
        <h4>Add a requirement</h4>
        <form className="admin-form" onSubmit={(event) => void save(event, "CREATE")}>
          <label>Program<select name="programId" defaultValue="" required>
            <option value="">Select an active program</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.code} · {program.title}</option>)}
          </select></label>
          <label>Applies to<select value={scope} onChange={(event) => setScope(event.target.value as CompetencyRequirementScope)}>
            {competencyRequirementScopes.map((value) => <option key={value} value={value}>{scopeLabels[value]}</option>)}
          </select></label>
          <label>{scopeLabels[scope]}<select key={scope} name="targetId" defaultValue="" required>
            <option value="">Select a target</option>
            {view.targets[scope].map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select></label>
          <button type="submit" disabled={saving || loading}>Add competency requirement</button>
        </form>
        <h4>Active requirement rules</h4>
        {view.requirements.length ? <ul>
          {view.requirements.map((requirement) => <li key={requirement.id}>
            {requirement.programLabel} · {scopeLabels[requirement.scope]} · {requirement.targetLabel}{" "}
            <button type="button" disabled={saving || loading} onClick={() => setRetiringId(requirement.id)}>Retire</button>
            {retiringId === requirement.id && <form className="admin-form" onSubmit={(event) => void save(event, "RETIRE")}>
              <label>Reason for retiring<input name="reason" maxLength={1000} required /></label>
              <button type="submit" disabled={saving || loading}>Confirm retirement</button>
              <button type="button" disabled={saving} onClick={() => setRetiringId("")}>Cancel</button>
            </form>}
          </li>)}
        </ul> : <p>No active requirement rules.</p>}
      </>}
    </>}
  </div>;
}
