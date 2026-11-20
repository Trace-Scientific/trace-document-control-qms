"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { GovernedEvidenceFilePicker } from "./governed-evidence-file-picker";
import { DemoTrainingLesson } from "./demo-training-lesson";

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: "ACTIVE" | "INACTIVE" | "TERMINATED" };
type Course = { id: string; code: string; title: string; active: boolean };
type Assignment = { id: string; employeeId: string; courseId: string; assignedAt: string; dueAt: string | null; status: "ASSIGNED" | "COMPLETED" | "CANCELLED"; cancelReason?: string | null };
type Completion = { id: string; assignmentId: string; employeeId: string; courseId: string; completedAt: string; result: string | null; fileId: string | null; evidenceName?: string | null; evidenceStatus?: string | null };
type Section = "assignments" | "assign" | "complete" | "history" | "lifecycle" | "courses";

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

function dateOnlyTime(value: string | null) {
  if (!value) return null;
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function TrainingManagementWorkspace({ canManage, today }: { canManage: boolean; today: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("assignments");
  const [preselectedCourseId, setPreselectedCourseId] = useState("");
  const [preselectedAssignmentId, setPreselectedAssignmentId] = useState("");
  const [completionAssignmentId, setCompletionAssignmentId] = useState("");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentStatus, setAssignmentStatus] = useState("ALL");
  const [completionQuery, setCompletionQuery] = useState("");
  const [completionEvidence, setCompletionEvidence] = useState("ALL");
  const [previewCourseCode, setPreviewCourseCode] = useState("");
  const [previewAssignmentId, setPreviewAssignmentId] = useState("");

  async function load() {
    const [employeeResponse, courseResponse, assignmentResponse, completionResponse] = await Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/courses", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/assignments", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/completions", { credentials: "same-origin", cache: "no-store" }),
    ]);
    if ((!employeeResponse.ok && employeeResponse.status !== 403) || !courseResponse.ok || !assignmentResponse.ok || !completionResponse.ok) {
      setNotice("Training data could not be refreshed. Reload before making governed changes.");
      return;
    }
    const [employeeBody, courseBody, assignmentBody, completionBody] = await Promise.all([
      employeeResponse.ok ? employeeResponse.json() : { data: [] }, courseResponse.json(), assignmentResponse.json(), completionResponse.json(),
    ]);
    setEmployees(employeeBody.data ?? []);
    setCourses(courseBody.data ?? []);
    setAssignments(assignmentBody.data ?? []);
    setCompletions(completionBody.data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/courses", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/assignments", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/completions", { credentials: "same-origin", cache: "no-store" }),
    ]).then(async ([employeeResponse, courseResponse, assignmentResponse, completionResponse]) => {
      if (cancelled) return;
      if ((!employeeResponse.ok && employeeResponse.status !== 403) || !courseResponse.ok || !assignmentResponse.ok || !completionResponse.ok) {
        if (!cancelled) setNotice("Training data could not be refreshed. Reload before making governed changes.");
        return;
      }
      const [employeeBody, courseBody, assignmentBody, completionBody] = await Promise.all([
        employeeResponse.ok ? employeeResponse.json() : { data: [] }, courseResponse.json(), assignmentResponse.json(), completionResponse.json(),
      ]);
      if (!cancelled) {
        setEmployees(employeeBody.data ?? []);
        setCourses(courseBody.data ?? []);
        setAssignments(assignmentBody.data ?? []);
        setCompletions(completionBody.data ?? []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const todayStart = useMemo(() => dateOnlyTime(today) ?? 0, [today]);
  const activeAssignments = assignments.filter((assignment) => assignment.status === "ASSIGNED");
  const activeCourses = courses.filter((course) => course.active);
  const eligibleEmployees = employees.filter((employee) => employee.status === "ACTIVE");
  const completionAssignment = assignments.find((assignment) => assignment.id === completionAssignmentId);
  const completionCourseCode = completionAssignment ? courseById.get(completionAssignment.courseId)?.code : undefined;
  const demoCompletionEvidenceRequired = completionCourseCode === "DEMO-HIPAA" || completionCourseCode === "DEMO-BBP";

  const queryWords = assignmentQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleAssignments = assignments.map((assignment) => {
    const dueTime = dateOnlyTime(assignment.dueAt);
    const status = assignment.status === "ASSIGNED" && dueTime !== null && dueTime < todayStart ? "OVERDUE" : assignment.status;
    const employee = employeeById.get(assignment.employeeId);
    const course = courseById.get(assignment.courseId);
    const employeeLabel = employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : assignment.employeeId;
    const courseLabel = course ? `${course.code} · ${course.title}` : assignment.courseId;
    return { assignment, status, employeeLabel, courseLabel };
  }).filter(({ status, employeeLabel, courseLabel }) => {
    if (assignmentStatus !== "ALL" && status !== assignmentStatus) return false;
    const searchText = `${employeeLabel} ${courseLabel}`.toLowerCase();
    return queryWords.every((word) => searchText.includes(word));
  });

  const visibleCompletions = completions.filter((completion) => {
    const employee = employeeById.get(completion.employeeId);
    const course = courseById.get(completion.courseId);
    const searchText = `${employee?.employeeNumber ?? ""} ${employee?.firstName ?? ""} ${employee?.lastName ?? ""} ${course?.code ?? ""} ${course?.title ?? ""} ${completion.result ?? ""}`.toLowerCase();
    if (!completionQuery.trim().toLowerCase().split(/\s+/).filter(Boolean).every((word) => searchText.includes(word))) return false;
    if (completionEvidence === "ATTACHED") return Boolean(completion.fileId);
    if (completionEvidence === "MISSING") return !completion.fileId;
    return true;
  });

  function startAssignment(course: Course) {
    setPreselectedCourseId(course.id);
    setNotice("");
    setSection("assign");
  }

  function startCompletion(assignment: Assignment) {
    setPreselectedAssignmentId(assignment.id);
    setCompletionAssignmentId(assignment.id);
    setNotice("");
    setSection("complete");
  }

  async function submit(path: string, payload: unknown, form: HTMLFormElement) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(body?.error || "Training operation failed.");
        return;
      }
      form.reset();
      setNotice("Training operation recorded with audit evidence.");
      await load();
    } catch {
      setNotice("Unable to reach the training service. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await submit("/api/training/courses", { code: String(form.get("code")), title: String(form.get("title")), description: String(form.get("description")) || null }, event.currentTarget);
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await submit("/api/training/assignments", { employeeId: String(form.get("employeeId")), courseId: String(form.get("courseId")), assignedAt: String(form.get("assignedAt")), dueAt: String(form.get("dueAt")) || null }, event.currentTarget);
  }

  async function lifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const action = String(form.get("action"));
    const payload = action === "cancel"
      ? { action, assignmentId: String(form.get("assignmentId")), reason: String(form.get("reason")) }
      : { action, assignmentId: String(form.get("assignmentId")), reason: String(form.get("reason")), assignedAt: String(form.get("assignedAt")), dueAt: String(form.get("dueAt")) || null };
    await submit("/api/training/lifecycle", payload, event.currentTarget);
  }

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await submit("/api/training/completions", { assignmentId: String(form.get("assignmentId")), completedAt: new Date(String(form.get("completedAt"))).toISOString(), result: String(form.get("result")) || null, fileId: String(form.get("fileId")) || null }, event.currentTarget);
  }

  const sections = [
    { id: "assignments" as const, label: "Training assignments", description: "Browse active, completed, cancelled, and overdue training." },
    { id: "assign" as const, label: "Assign training", description: "Assign an approved course to an eligible employee." },
    { id: "complete" as const, label: "Record completion", description: "Record completion results and governed supporting evidence." },
    { id: "history" as const, label: "Completion history", description: "Review immutable completion results, timestamps, and evidence." },
    { id: "lifecycle" as const, label: "Lifecycle actions", description: "Cancel or reassign active training with a controlled reason." },
    { id: "courses" as const, label: "Course configuration", description: "Browse courses and start new assignments." },
  ].filter((item) => canManage || item.id === "assignments" || item.id === "history" || item.id === "courses");

  return <section className="workspace-section" aria-labelledby="training-heading">
    <div className="section-heading"><div><p className="eyebrow">Training & competency</p><h2 id="training-heading">Training management</h2><p>Open one governed training function at a time while preserving assignment, completion, and lifecycle history.</p></div></div>
    <nav className="module-subnav" aria-label="Training management sections">{sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => { setPreselectedCourseId(""); setPreselectedAssignmentId(""); setSection(item.id); setNotice(""); void load(); }}><strong>{item.label}</strong><span>{item.description}</span></button>)}</nav>
    {notice && <p role="status">{notice}</p>}

    {section === "assignments" && <div className="module-section-stack">
      <div className="section-heading"><div><h3>Training assignments</h3><p>Browse governed training assignments and their current lifecycle state.</p></div></div>
      <div className="admin-form">
        <label>Search assignments<input type="search" value={assignmentQuery} onChange={(event) => setAssignmentQuery(event.target.value)} placeholder="Employee name, number, or course" /></label>
        <label>Assignment status<select value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="OVERDUE">Overdue</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Course</th><th>Assigned</th><th>Due</th><th>Status</th><th>Lifecycle evidence</th>{canManage && <th>Action</th>}</tr></thead>
          <tbody>{visibleAssignments.map(({ assignment, status, employeeLabel, courseLabel }) => (
            <tr key={assignment.id}>
              <td>{employeeLabel}</td><td>{courseLabel}{["DEMO-HIPAA", "DEMO-BBP"].includes(courseById.get(assignment.courseId)?.code ?? "") && <div className="training-assignment-preview-action"><button type="button" className="training-lesson-button" aria-expanded={previewAssignmentId === assignment.id} onClick={() => setPreviewAssignmentId(previewAssignmentId === assignment.id ? "" : assignment.id)}>{previewAssignmentId === assignment.id ? "Hide lessons" : "Open practice lessons"}</button></div>}</td>
              <td>{formatDateOnly(assignment.assignedAt)}</td><td>{formatDateOnly(assignment.dueAt)}</td>
              <td>{status}</td><td>{assignment.cancelReason ?? "—"}</td>
              {canManage && <td>{assignment.status === "ASSIGNED" && (
                <button type="button" disabled={busy} aria-label={`Record completion for ${courseLabel} assigned to ${employeeLabel}`} onClick={() => startCompletion(assignment)}>Record completion</button>
              )}</td>}
            </tr>
          ))}
          {!visibleAssignments.length && <tr><td colSpan={canManage ? 7 : 6}>
            {assignments.length ? "No training assignments match these filters." : "No training assignments have been recorded."}
          </td></tr>}</tbody>
        </table>
      </div>
      {previewAssignmentId && (() => {
        const assignment = assignments.find((item) => item.id === previewAssignmentId);
        const course = assignment ? courseById.get(assignment.courseId) : undefined;
        const employee = assignment ? employeeById.get(assignment.employeeId) : undefined;
        if (!assignment || !course || !["DEMO-HIPAA", "DEMO-BBP"].includes(course.code)) return null;
        return <div className="module-section-stack">
          <p><strong>Assigned training preview:</strong> {employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : assignment.employeeId} · {course.title} · {assignment.status}</p>
          <p>This is a supervisor-accessible demonstration preview, not an authenticated employee learning session. Practice answers are not saved, and completing the quiz does not change the assignment or create a completion record.</p>
          {canManage ? <DemoTrainingLesson key={assignment.id} courseCode={course.code} assignmentId={assignment.id} /> : <DemoTrainingLesson key={assignment.id} courseCode={course.code} />}
        </div>;
      })()}
    </div>}

    {section === "assign" && canManage && <div className="module-section-stack">
      <div className="section-heading"><div><h3>Assign training</h3><p>Assign an active course to an eligible employee with governed dates.</p></div></div>
      {!eligibleEmployees.length && <p>No eligible employees are available. Check Personnel and your access to employee records.</p>}
      <form onSubmit={createAssignment} className="admin-form">
        <label>Employee<select name="employeeId" defaultValue="" required><option value="" disabled>Select employee</option>{eligibleEmployees.map((employee) => (
          <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.lastName}, {employee.firstName}</option>
        ))}</select></label>
        <label>Course<select name="courseId" defaultValue={preselectedCourseId} required><option value="" disabled>Select course</option>{activeCourses.map((course) => (
          <option key={course.id} value={course.id}>{course.code} · {course.title}</option>
        ))}</select></label>
        <label>Assigned date<input name="assignedAt" type="date" defaultValue={today.slice(0, 10)} required /></label>
        <label>Due date<input name="dueAt" type="date" /></label>
        <button type="submit" disabled={busy || !eligibleEmployees.length || !activeCourses.length}>Assign training</button>
      </form>
    </div>}

    {section === "complete" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Record completion</h3><p>Record completion results with governed supporting evidence. Demo HIPAA and Bloodborne Pathogens assignments require an available evidence file. Practice quiz scores do not qualify as official completion evidence.</p></div></div><form onSubmit={complete} className="admin-form"><label>Assignment<select name="assignmentId" value={completionAssignmentId} onChange={(event) => setCompletionAssignmentId(event.target.value)} required><option value="" disabled>Select active assignment</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{employeeById.get(assignment.employeeId)?.employeeNumber ?? assignment.employeeId} · {courseById.get(assignment.courseId)?.code ?? assignment.courseId}</option>)}</select></label><label>Completed at<input name="completedAt" type="datetime-local" defaultValue={localDateTimeInputValue(new Date())} required /></label><label>Result<input name="result" maxLength={500} /></label>{demoCompletionEvidenceRequired && <p role="status"><strong>Evidence required for {completionCourseCode}:</strong> Select an AVAILABLE governed training evidence file before recording this completion. The administrator must independently verify that the evidence supports completion; a practice score alone is insufficient.</p>}<GovernedEvidenceFilePicker domain="training" disabled={busy} /><button type="submit" disabled={busy}>Record completion</button></form></div>}

    {section === "history" && <div className="module-section-stack"><div className="section-heading"><div><h3>Completion history</h3><p>Review immutable training completion results, event timestamps, and governed evidence references.</p></div></div><div className="admin-form"><label>Search completions<input type="search" value={completionQuery} onChange={(event) => setCompletionQuery(event.target.value)} placeholder="Employee, course, or result" /></label><label>Evidence attachment<select value={completionEvidence} onChange={(event) => setCompletionEvidence(event.target.value)}><option value="ALL">All records</option><option value="ATTACHED">With attached evidence</option><option value="MISSING">Without attached evidence</option></select></label></div><p>Attachment status is informational. An attached file does not by itself establish verified competency or approval.</p><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Course</th><th>Completed at</th><th>Result</th><th>Evidence</th></tr></thead><tbody>{visibleCompletions.map((completion) => {
      const employee = employeeById.get(completion.employeeId); const course = courseById.get(completion.courseId);
      return <tr key={completion.id}><td>{employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : completion.employeeId}</td><td>{course ? `${course.code} · ${course.title}` : completion.courseId}</td><td>{new Date(completion.completedAt).toLocaleString()}</td><td>{completion.result ?? "—"}</td><td>{completion.fileId ? `${completion.evidenceName ?? "Attached file"} · ${completion.evidenceStatus ?? "Linked"}` : "—"}</td></tr>;
    })}{!visibleCompletions.length && <tr><td colSpan={5}>{completions.length ? "No completion records match the selected filters." : "No training completions have been recorded."}</td></tr>}</tbody></table></div></div>}

    {section === "lifecycle" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Lifecycle actions</h3><p>Cancel or reassign active training without rewriting assignment history.</p></div></div><form onSubmit={lifecycle} className="admin-form"><label>Assignment<select name="assignmentId" defaultValue="" required><option value="" disabled>Select active assignment</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{employeeById.get(assignment.employeeId)?.employeeNumber ?? assignment.employeeId} · {courseById.get(assignment.courseId)?.code ?? assignment.courseId}</option>)}</select></label><label>Action<select name="action" defaultValue="cancel"><option value="cancel">Cancel</option><option value="reassign">Reassign</option></select></label><label>Reason<input name="reason" maxLength={500} required /></label><label>New assigned date<input name="assignedAt" type="date" /></label><label>New due date<input name="dueAt" type="date" /></label><button type="submit" disabled={busy}>Apply lifecycle action</button></form></div>}

    {section === "courses" && <div className="module-section-stack">
      <div className="section-heading"><div><h3>Course configuration</h3></div></div>
      <div className="table-wrap">
        <table aria-label="Training courses">
          <thead><tr><th>Course code</th><th>Course title</th><th>Lessons</th><th>Status</th>{canManage && <th>Action</th>}</tr></thead>
          <tbody>
            {courses.map((course) => <tr key={course.id}>
              <td>{course.code}</td>
              <td>{course.title}</td>
              <td>{["DEMO-HIPAA", "DEMO-BBP"].includes(course.code) && <button type="button" className="training-lesson-button" aria-expanded={previewCourseCode === course.code} onClick={() => setPreviewCourseCode(previewCourseCode === course.code ? "" : course.code)}>{previewCourseCode === course.code ? "Hide lessons" : "View lessons & quiz"}</button>}</td>
              <td>{course.active ? "Active" : "Inactive"}</td>
              {canManage && <td>{course.active && (
                <button type="button" disabled={busy} aria-label={`Assign ${course.title}`} onClick={() => startAssignment(course)}>Assign course</button>
              )}</td>}
            </tr>)}
            {!courses.length && <tr><td colSpan={canManage ? 5 : 4}>No training courses have been created.</td></tr>}
          </tbody>
        </table>
      </div>
      {previewCourseCode && <DemoTrainingLesson key={previewCourseCode} courseCode={previewCourseCode} />}
      {canManage && <form onSubmit={createCourse} className="admin-form">
        <label>Course code<input name="code" maxLength={80} required /></label>
        <label>Course title<input name="title" maxLength={240} required /></label>
        <label>Description<textarea name="description" maxLength={2000} /></label>
        <button type="submit" disabled={busy}>Create course</button>
      </form>}
    </div>}
  </section>;
}
