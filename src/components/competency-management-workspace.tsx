"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { competencyDashboard, competencyRollups, type CompetencyAssessmentSummary } from "@/lib/training/competency-rollup";
import { competencyScheduleMaxDays } from "@/lib/training/competency-schedule";
import { cliaCompetencyMethods } from "@/lib/training/clia-competency-methods";
import { CliaCompetencyProgramBuilder } from "./clia-competency-program-builder";
import { CompetencyProgramScopeFields } from "./competency-program-scope-fields";
import { CompetencyRequirementsMatrix } from "./competency-requirements-matrix";
import { GovernedEvidenceFilePicker } from "./governed-evidence-file-picker";

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: "ACTIVE" | "INACTIVE" | "TERMINATED" };
type Program = { id: string; code: string; title: string; active: boolean; validityDays: number | null; scopeLabel?: string | null };
type Element = { id: string; programId: string; code: string; title: string; required: boolean; sortOrder: number };
type Assessment = CompetencyAssessmentSummary & { fileId: string | null; notes: string | null; assessorUserId: string };
type EvidenceFileSummary = { id: string; originalName: string; status: string };
type Section = "status" | "requirements" | "history" | "assessment" | "programs" | "elements";

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return calendar;
  return `${month}/${day}/${year}`;
}

function localDateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CompetencyManagementWorkspace({ canManage, today }: { canManage: boolean; today: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [elements, setElements] = useState<Element[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFileSummary[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [programFormVersion, setProgramFormVersion] = useState(0);
  const [section, setSection] = useState<Section>("status");
  const [workspaceStatus, setWorkspaceStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusQuery, setStatusQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeOnly, setActiveOnly] = useState(true);
  const [elementCode, setElementCode] = useState("");
  const [elementTitle, setElementTitle] = useState("");
  const [elementMethod, setElementMethod] = useState("");
  const [elementOrder, setElementOrder] = useState(0);
  const [elementRequired, setElementRequired] = useState(true);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historyEvidenceFilter, setHistoryEvidenceFilter] = useState<"ALL" | "ATTACHED" | "MISSING">("ALL");
  const [historyOutcomeFilter, setHistoryOutcomeFilter] = useState<"ALL" | "QUALIFIED" | "CONDITIONAL" | "NOT_QUALIFIED">("ALL");

  async function fetchWorkspaceData() {
    const responses = await Promise.all([
      fetch("/api/personnel", { credentials: "same-origin" }),
      fetch("/api/training/competency/programs", { credentials: "same-origin" }),
      fetch("/api/training/competency/assessments", { credentials: "same-origin" }),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error("Unable to load competency records. Retry to refresh.");
    const [employeeBody, programBody, assessmentBody] = await Promise.all(responses.map((response) => response.json()));
    if (!Array.isArray(employeeBody?.data) || !Array.isArray(programBody?.data) || !Array.isArray(assessmentBody?.data)) {
      throw new Error("Competency records could not be read. Retry to refresh.");
    }
    return { employees: employeeBody.data as Employee[], programs: programBody.data as Program[], assessments: assessmentBody.data as Assessment[] };
  }

  function applyWorkspaceData(data: Awaited<ReturnType<typeof fetchWorkspaceData>>) {
    setEmployees(data.employees);
    setPrograms(data.programs);
    setAssessments(data.assessments);
    setWorkspaceStatus("ready");
  }

  async function load() {
    const data = await fetchWorkspaceData();
    applyWorkspaceData(data);
    try {
      const response = await fetch("/api/evidence-files?domain=training", { credentials: "same-origin" });
      if (!response.ok) return;
      const body = await response.json();
      if (Array.isArray(body?.data)) setEvidenceFiles(body.data as EvidenceFileSummary[]);
    } catch {
      // Keep the assessment history and file identifiers available if metadata refresh fails.
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaceData()
      .then((data) => { if (!cancelled) applyWorkspaceData(data); })
      .catch(() => { if (!cancelled) { setWorkspaceStatus("error"); setNotice("Unable to load competency records. Refresh to retry."); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/evidence-files?domain=training", { credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => { if (!cancelled && Array.isArray(body?.data)) setEvidenceFiles(body.data as EvidenceFileSummary[]); })
      .catch(() => { /* Evidence references remain visible if file metadata is unavailable. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedProgramId) return;
    let cancelled = false;
    void fetch(`/api/training/competency/elements?programId=${encodeURIComponent(selectedProgramId)}`, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load competency elements.");
        const body = await response.json();
        if (!Array.isArray(body?.data)) throw new Error("Invalid competency element response.");
        return body.data as Element[];
      })
      .then((data) => { if (!cancelled) setElements(data); })
      .catch(() => { if (!cancelled) { setElements([]); setNotice("Unable to load program elements. Select the program again to retry."); } });
    return () => { cancelled = true; };
  }, [selectedProgramId]);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const programById = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs]);
  const evidenceById = useMemo(() => new Map(evidenceFiles.map((file) => [file.id, file])), [evidenceFiles]);
  const rollups = useMemo(() => competencyRollups(assessments, today), [assessments, today]);
  const scopedRollups = rollups.filter(row => !activeOnly || (employeeById.get(row.employeeId)?.status === "ACTIVE" && programById.get(row.programId)?.active));
  const dashboard = competencyDashboard(scopedRollups);
  const visibleRollups = scopedRollups.filter(row => {
    if (statusFilter === "ATTENTION" ? row.status === "CURRENT" : statusFilter !== "ALL" && row.status !== statusFilter) return false;
    const employee = employeeById.get(row.employeeId);
    const program = programById.get(row.programId);
    const search = [employee?.employeeNumber, employee?.firstName, employee?.lastName, program?.code, program?.title].filter(Boolean).join(" ").toLowerCase();
    return statusQuery.trim().toLowerCase().split(/\s+/).filter(Boolean).every(word => search.includes(word));
  });
  async function refreshStatus() {
    setWorkspaceStatus("loading");
    try { await load(); } catch { setWorkspaceStatus("error"); }
  }
  const historyWords = historyQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleHistory = [...assessments].filter((assessment) => {
    if (historyEmployeeId && assessment.employeeId !== historyEmployeeId) return false;
    const assessmentDate = assessment.assessedAt.slice(0, 10);
    if (historyFromDate && assessmentDate < historyFromDate) return false;
    if (historyToDate && assessmentDate > historyToDate) return false;
    if (historyOutcomeFilter !== "ALL" && assessment.outcome !== historyOutcomeFilter) return false;
    if (historyEvidenceFilter === "ATTACHED" && !assessment.fileId) return false;
    if (historyEvidenceFilter === "MISSING" && assessment.fileId) return false;
    const employee = employeeById.get(assessment.employeeId);
    const program = programById.get(assessment.programId);
    const searchText = [
      employee?.employeeNumber, employee?.firstName, employee?.lastName,
      program?.code, program?.title, assessment.outcome, assessment.assessorUserId, assessment.notes, assessment.fileId, assessment.fileId ? evidenceById.get(assessment.fileId)?.originalName : null,
    ].filter(Boolean).join(" ").toLowerCase();
    return historyWords.every((word) => searchText.includes(word));
  }).sort((a, b) => b.assessedAt.localeCompare(a.assessedAt));

  async function submit(path: string, payload: unknown, form: HTMLFormElement) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(body?.error || "Competency operation failed.");
        return;
      }
      form.reset();
      if (path === "/api/training/competency/programs") setProgramFormVersion((version) => version + 1);
      if (path === "/api/training/competency/elements") { setElementCode(""); setElementTitle(""); setElementMethod(""); setElementOrder(0); setElementRequired(true); }
      setSelectedProgramId("");
      setSelectedEmployeeId("");
      setElements([]);
      setNotice("Competency operation recorded with audit evidence.");
      try {
        await load();
      } catch {
        setNotice("Competency operation was recorded, but the refreshed records could not be loaded. Refresh the page to verify.");
      }
    } catch {
      setNotice("Unable to reach the competency service. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function createProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const testSystemSelection = form.get("testSystemSelection");
    const initialDueDays = form.get("initialDueDays");
    const reassessmentIntervalDays = form.get("reassessmentIntervalDays");
    await submit("/api/training/competency/programs", {
      code: String(form.get("code")), title: String(form.get("title")), description: String(form.get("description")) || null,
      validityDays: form.get("validityDays") ? Number(form.get("validityDays")) : null,
      initialDueDays: initialDueDays ? Number(initialDueDays) : null,
      reassessmentIntervalDays: reassessmentIntervalDays ? Number(reassessmentIntervalDays) : null,
      equipmentId: form.get("equipmentId") || null,
      testSystemId: testSystemSelection === "new" ? null : testSystemSelection || null,
      newTestSystem: testSystemSelection === "new" ? {
        code: String(form.get("testSystemCode")), name: String(form.get("testSystemName")),
      } : null,
    }, event.currentTarget);
  }

  async function createElement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await submit("/api/training/competency/elements", {
      programId: String(form.get("programId")), code: String(form.get("code")), title: String(form.get("title")),
      method: String(form.get("method")) || null, required: form.get("required") === "on", sortOrder: Number(form.get("sortOrder") || 0),
    }, event.currentTarget);
  }

  function startReassessmentFromHistory(assessment: Assessment) {
    const employee = employees.find((item) => item.id === assessment.employeeId);
    const program = programs.find((item) => item.id === assessment.programId);
    if (!employee || employee.status !== "ACTIVE" || !program?.active) {
      setNotice("Reassessment requires an active employee and active competency program.");
      return;
    }
    setElements([]);
    setSelectedEmployeeId(assessment.employeeId);
    setSelectedProgramId(assessment.programId);
    setNotice("Employee and program selected. Record new observations and an independent assessment decision; prior results are not copied.");
    setSection("assessment");
  }

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const programId = String(form.get("programId"));
    const programElements = elements.filter((element) => element.programId === programId);
    const elementResults = programElements.map((element) => ({ elementId: element.id, outcome: String(form.get(`outcome:${element.id}`)) as "PASS" | "FAIL" | "NOT_APPLICABLE", notes: null }));
    if (!programElements.length || !form.get("outcome") || elementResults.some((result) => !["PASS", "FAIL", "NOT_APPLICABLE"].includes(result.outcome))) {
      setNotice("Select an overall decision and explicitly assess every program element before recording.");
      return;
    }
    if (form.get("outcome") === "QUALIFIED" && programElements.some((element) => element.required && elementResults.some((result) => result.elementId === element.id && result.outcome === "FAIL"))) {
      setNotice("An assessment with a failed required element cannot be marked Qualified. Review the overall decision.");
      return;
    }
    const assessedAtValue = String(form.get("assessedAt"));
    const assessedAt = new Date(assessedAtValue);
    if (Number.isNaN(assessedAt.getTime())) {
      setNotice("Enter a valid assessment date and time.");
      return;
    }
    if (assessedAt.getTime() > Date.now()) {
      setNotice("Competency assessments cannot be recorded with a future assessment date.");
      return;
    }
    const expiresAtValue = String(form.get("expiresAt"));
    if (expiresAtValue && expiresAtValue < assessedAtValue.slice(0, 10)) {
      setNotice("Competency expiration cannot precede the assessment date.");
      return;
    }
    await submit("/api/training/competency/assessments", {
      employeeId: String(form.get("employeeId")), programId, assessedAt: assessedAt.toISOString(),
      outcome: String(form.get("outcome")), expiresAt: String(form.get("expiresAt")) || null,
      fileId: String(form.get("fileId")) || null, notes: String(form.get("notes")) || null, elementResults,
    }, event.currentTarget);
  }

  function startReassessment(employeeId: string, programId: string) {
    setSelectedEmployeeId(employeeId);
    if (selectedProgramId !== programId) setElements([]);
    setSelectedProgramId(programId);
    setNotice("");
    setSection("assessment");
  }

  const sections = [
    { id: "status" as const, label: "Competency status", description: "Review current qualification status, expirations, and reassessment needs.", visible: true },
    { id: "requirements" as const, label: "Requirements matrix", description: "See required programs and missing initial assessments.", visible: true },
    { id: "history" as const, label: "Assessment history", description: "Search previous competency decisions without changing records.", visible: true },
    { id: "assessment" as const, label: "Record assessment", description: "Record an append-only competency assessment with governed supporting evidence.", visible: canManage },
    { id: "programs" as const, label: "Programs", description: "Create governed competency programs and validity periods.", visible: canManage },
    { id: "elements" as const, label: "Program elements", description: "Configure required assessment elements and methods for each program.", visible: canManage },
  ].filter((item) => item.visible);

  return <section className="workspace-section" aria-labelledby="competency-heading">
    <div className="section-heading"><div><p className="eyebrow">Training & competency</p><h2 id="competency-heading">Competency management</h2><p>Open one governed competency function at a time while preserving append-only assessment history and derived qualification status.</p></div></div>
    <nav className="module-subnav" aria-label="Competency management sections">
      {sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><strong>{item.label}</strong><span>{item.description}</span></button>)}
    </nav>
    {notice && <p role="status">{notice}</p>}

    {section === "status" && <div className="module-section-stack">
      <button type="button" disabled={busy || workspaceStatus === "loading"} onClick={() => void refreshStatus()}>Refresh competency status</button>
      {workspaceStatus !== "ready" ? <p role="status">{workspaceStatus === "loading" ? "Loading competency records…" : "Competency status unavailable. Refresh to retry."}</p> : <>
      <p>Counts reflect recorded employee-program assessments only. Employees without assessments are not represented; these counts do not establish laboratory-wide compliance.</p>
      <label><input type="checkbox" checked={activeOnly} onChange={event => setActiveOnly(event.target.checked)} /> Active employees and programs only</label>
      <div className="stat-grid">
        <article><strong>{dashboard.total}</strong><span>Tracked</span></article>
        <article><strong>{dashboard.current}</strong><span>Current</span></article>
        <article><strong>{dashboard.dueSoon}</strong><span>Due within 30 days</span></article>
        <article><strong>{dashboard.expired}</strong><span>Expired</span></article>
        <article><strong>{dashboard.notQualified}</strong><span>Not qualified</span></article>
        <article><strong>{dashboard.conditional}</strong><span>Conditional</span></article>
      </div>
      <label>Search competency status<input type="search" value={statusQuery} onChange={event => setStatusQuery(event.target.value)} placeholder="Employee or program" /></label>
      <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{[["ALL","All statuses"],["ATTENTION","Requires attention"],["CURRENT","Current"],["DUE_SOON","Due within 30 days"],["EXPIRED","Expired"],["NOT_QUALIFIED","Not qualified"],["CONDITIONAL","Conditional"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Program</th><th>Latest assessment</th><th>Expires</th><th>Status</th>{canManage && <th>Action</th>}</tr></thead><tbody>{visibleRollups.map((rollup) => { const employee = employeeById.get(rollup.employeeId); const program = programById.get(rollup.programId); return <tr key={`${rollup.employeeId}:${rollup.programId}`}><td>{employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : rollup.employeeId}</td><td>{program ? `${program.code} · ${program.title}` : rollup.programId}</td><td>{new Date(rollup.assessedAt).toLocaleDateString()}</td><td>{formatDateOnly(rollup.expiresAt)}</td><td>{rollup.status}</td>{canManage && <td>{employee?.status === "ACTIVE" && program?.active && <button type="button" disabled={busy} onClick={() => startReassessment(rollup.employeeId, rollup.programId)}>Reassess</button>}</td>}</tr>; })}{!visibleRollups.length && <tr><td colSpan={canManage ? 6 : 5}>No recorded competency statuses match this view.</td></tr>}</tbody></table></div>
      </>}
    </div>}

    {section === "requirements" && <CompetencyRequirementsMatrix
      canManage={canManage}
      programs={programs.filter((program) => program.active)}
      today={today}
      onAssess={startReassessment}
    />}

    {section === "history" && <div className="module-section-stack">
      <div className="section-heading"><div><h3>Competency assessment history</h3><p>Review recorded assessments in newest-first order. Historical decisions remain unchanged when reassessments are added. The assessor account identifier, evidence file reference, and recorded notes are shown for audit traceability. An attached file reference alone does not establish competency.</p></div></div>
      <label>Search assessment history<input type="search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Employee, program, assessor, notes, or evidence filename" /></label>
      <label>Employee<select value={historyEmployeeId} onChange={(event) => setHistoryEmployeeId(event.target.value)}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.lastName}, {employee.firstName}</option>)}</select></label>
      <label>Evidence status<select value={historyEvidenceFilter} onChange={(event) => setHistoryEvidenceFilter(event.target.value as "ALL" | "ATTACHED" | "MISSING")}><option value="ALL">All assessments</option><option value="ATTACHED">Evidence attached</option><option value="MISSING">Missing evidence attachment</option></select></label>
      <div className="module-action-row">
        {[30, 90].map((days) => <button key={days} type="button" onClick={() => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - (days - 1)); const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; setHistoryFromDate(localDay(start)); setHistoryToDate(localDay(end)); }}>Last {days} days</button>)}
      </div>
      <label>Assessed on or after<input type="date" value={historyFromDate} max={historyToDate || undefined} onChange={(event) => setHistoryFromDate(event.target.value)} /></label>
      <label>Assessed on or before<input type="date" value={historyToDate} min={historyFromDate || undefined} onChange={(event) => setHistoryToDate(event.target.value)} /></label>
      <label>Assessment decision<select value={historyOutcomeFilter} onChange={(event) => setHistoryOutcomeFilter(event.target.value as "ALL" | "QUALIFIED" | "CONDITIONAL" | "NOT_QUALIFIED")}><option value="ALL">All decisions</option><option value="QUALIFIED">Qualified</option><option value="CONDITIONAL">Conditional</option><option value="NOT_QUALIFIED">Not qualified</option></select></label>
      <p>Showing {visibleHistory.length} of {assessments.length} assessments. Missing an attachment does not by itself determine competency status.</p>
      {(historyQuery || historyEmployeeId || historyFromDate || historyToDate || historyEvidenceFilter !== "ALL" || historyOutcomeFilter !== "ALL") && <button type="button" onClick={() => { setHistoryQuery(""); setHistoryEmployeeId(""); setHistoryFromDate(""); setHistoryToDate(""); setHistoryEvidenceFilter("ALL"); setHistoryOutcomeFilter("ALL"); }}>Clear history filters</button>}
      <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Program</th><th>Assessed at</th><th>Assessor account</th><th>Outcome</th><th>Expires</th><th>Evidence file</th><th>Assessment notes</th>{canManage && <th>Next action</th>}</tr></thead><tbody>
        {visibleHistory.map((assessment) => { const employee = employeeById.get(assessment.employeeId); const program = programById.get(assessment.programId); return <tr key={assessment.id}><td>{employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : assessment.employeeId}</td><td>{program ? `${program.code} · ${program.title}` : assessment.programId}</td><td>{new Date(assessment.assessedAt).toLocaleString()}</td><td><code>{assessment.assessorUserId}</code></td><td>{assessment.outcome}</td><td>{formatDateOnly(assessment.expiresAt)}</td><td>{assessment.fileId ? <><span>{evidenceById.get(assessment.fileId)?.originalName || "File reference"}</span> <code>{assessment.fileId}</code></> : "Not attached"}</td><td>{assessment.notes || "—"}</td>{canManage && <td><button type="button" disabled={busy || employee?.status !== "ACTIVE" || !program?.active} onClick={() => startReassessmentFromHistory(assessment)}>Reassess</button></td>}</tr>; })}
        {!visibleHistory.length && <tr><td colSpan={canManage ? 9 : 8}>{assessments.length ? "No assessments match this search." : "No competency assessments have been recorded."}</td></tr>}
      </tbody></table></div>
    </div>}

    {section === "assessment" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Record competency assessment</h3><p>Record an append-only assessment decision and supporting evidence. Training completion alone does not establish competency: assess each program element and select the qualification outcome based on observed evidence.</p></div></div><form onSubmit={createAssessment} className="admin-form">
      <label>Employee<select name="employeeId" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} required><option value="" disabled>Select employee</option>{employees.filter((employee) => employee.status === "ACTIVE").map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.lastName}, {employee.firstName}</option>)}</select></label>
      <label>Program<select name="programId" value={selectedProgramId} onChange={(event) => { setElements([]); setSelectedProgramId(event.target.value); }} required><option value="" disabled>Select program</option>{programs.filter((program) => program.active).map((program) => <option key={program.id} value={program.id}>{[program.code, program.title, program.scopeLabel].filter(Boolean).join(" · ")}</option>)}</select></label>
      <label>Assessed at<input name="assessedAt" type="datetime-local" defaultValue={localDateTimeInputValue(new Date())} required /></label><label>Overall outcome<select name="outcome" defaultValue="" required><option value="" disabled>Select overall decision</option><option value="QUALIFIED">Qualified</option><option value="CONDITIONAL">Conditional</option><option value="NOT_QUALIFIED">Not qualified</option></select></label><label>Explicit expiration<input name="expiresAt" type="date" /></label><label>Notes<textarea name="notes" maxLength={2000} /></label>
      {elements.map((element) => <label key={element.id}>{element.code} · {element.title}{element.required ? " *" : ""}<select name={`outcome:${element.id}`} defaultValue="" required><option value="" disabled>Select assessment result</option><option value="PASS">Pass</option><option value="FAIL">Fail</option>{!element.required && <option value="NOT_APPLICABLE">Not applicable</option>}</select></label>)}
      <GovernedEvidenceFilePicker domain="training" disabled={busy} />
      <button type="submit" disabled={busy || !selectedProgramId || elements.length === 0}>Record competency assessment</button>
    </form></div>}

    {section === "programs" && canManage && <div className="module-section-stack">
      <div className="section-heading"><div>
        <h3>Competency programs</h3>
        <p>Choose an instrument or test system when the program applies to specific laboratory work.</p>
      </div></div>
      <form onSubmit={createProgram} className="admin-form">
        <label>Program code<input name="code" maxLength={80} required /></label>
        <label>Program title<input name="title" maxLength={240} required /></label>
        <label>Validity days<input name="validityDays" type="number" min={1} max={3650} /></label>
        <label>Initial assessment due (days after requirement starts)
          <input name="initialDueDays" type="number" min={0} max={competencyScheduleMaxDays} />
        </label>
        <label>Recurring assessment (days after qualification)
          <input name="reassessmentIntervalDays" type="number" min={1} max={competencyScheduleMaxDays} />
        </label>
        <label>Description<textarea name="description" maxLength={2000} /></label>
        <CompetencyProgramScopeFields key={programFormVersion} />
        <button type="submit" disabled={busy}>Create competency program</button>
      </form>
    </div>}

    {section === "elements" && canManage && <CliaCompetencyProgramBuilder
      programs={programs.filter((program) => program.active)}
      onSaved={(programId) => {
        if (selectedProgramId === programId) {
          setSelectedProgramId("");
          setElements([]);
        }
      }}
    />}

    {section === "elements" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Program elements</h3><p>Configure the elements and methods required for competency assessment.</p></div></div><form onSubmit={createElement} className="admin-form"><label>Program<select name="programId" defaultValue="" required><option value="" disabled>Select program</option>{programs.filter((program) => program.active).map((program) => <option key={program.id} value={program.id}>{[program.code, program.title, program.scopeLabel].filter(Boolean).join(" · ")}</option>)}</select></label><label>CLIA assessment method preset<select value="" disabled={busy} onChange={event => { const preset = cliaCompetencyMethods.find(item => item.code === event.target.value); if (preset) { setElementCode(preset.code); setElementTitle(preset.title); setElementMethod(preset.method); setElementOrder(Number(preset.code.slice(-2))); setElementRequired(true); } }}><option value="">Choose a method to prefill</option>{cliaCompetencyMethods.map(item => <option key={item.code} value={item.code}>{item.title}</option>)}</select></label><p>Adapt each preset to the selected test system and laboratory procedure before saving. Add each applicable method separately. Presets do not certify compliance or create assessment results.</p><label>Element code<input name="code" maxLength={80} value={elementCode} onChange={event => setElementCode(event.target.value)} required /></label><label>Element title<input name="title" maxLength={240} value={elementTitle} onChange={event => setElementTitle(event.target.value)} required /></label><label>Method<input name="method" maxLength={500} value={elementMethod} onChange={event => setElementMethod(event.target.value)} /></label><label>Sort order<input name="sortOrder" type="number" min={0} value={elementOrder} onChange={event => setElementOrder(Number(event.target.value))} /></label><label><input name="required" type="checkbox" checked={elementRequired} onChange={event => setElementRequired(event.target.checked)} /> Required element</label><button type="submit" disabled={busy}>Add competency element</button></form></div>}
  </section>;
}
