"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { GovernedEvidenceFilePicker } from "./governed-evidence-file-picker";

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: "ACTIVE" | "INACTIVE" | "TERMINATED" };
type Course = { id: string; code: string; title: string; active: boolean };
type Assignment = { id: string; employeeId: string; courseId: string; assignedAt: string; dueAt: string | null; status: "ASSIGNED" | "COMPLETED" | "CANCELLED"; cancelReason?: string | null };
type Section = "assignments" | "assign" | "complete" | "lifecycle" | "courses";

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return calendar;
  return `${month}/${day}/${year}`;
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
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("assignments");

  async function load() {
    const [employeeResponse, courseResponse, assignmentResponse] = await Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/courses", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/assignments", { credentials: "same-origin", cache: "no-store" }),
    ]);
    if (!employeeResponse.ok || !courseResponse.ok || !assignmentResponse.ok) {
      setNotice("Training data could not be refreshed. Reload before making governed changes.");
      return;
    }
    const [employeeBody, courseBody, assignmentBody] = await Promise.all([
      employeeResponse.json(), courseResponse.json(), assignmentResponse.json(),
    ]);
    setEmployees(employeeBody.data ?? []);
    setCourses(courseBody.data ?? []);
    setAssignments(assignmentBody.data ?? []);
  }

  useEffect(() => { void load(); }, []);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const todayStart = useMemo(() => dateOnlyTime(today) ?? 0, [today]);
  const activeAssignments = assignments.filter((assignment) => assignment.status === "ASSIGNED");

  async function submit(path: string, payload: unknown, form: HTMLFormElement) {
    setBusy(true); setNotice("");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) return setNotice(body?.error || "Training operation failed.");
    form.reset();
    setNotice("Training operation recorded with audit evidence.");
    await load();
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
    { id: "lifecycle" as const, label: "Lifecycle actions", description: "Cancel or reassign active training with a controlled reason." },
    { id: "courses" as const, label: "Course configuration", description: "Create governed training courses." },
  ];

  return <section className="workspace-section" aria-labelledby="training-heading">
    <div className="section-heading"><div><p className="eyebrow">Training & competency</p><h2 id="training-heading">Training management</h2><p>Open one governed training function at a time while preserving assignment, completion, and lifecycle history.</p></div></div>
    <nav className="module-subnav" aria-label="Training management sections">{sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setNotice(""); void load(); }}><strong>{item.label}</strong><span>{item.description}</span></button>)}</nav>
    {notice && <p role="status">{notice}</p>}

    {section === "assignments" && <div className="module-section-stack"><div className="section-heading"><div><h3>Training assignments</h3><p>Browse governed training assignments and their current lifecycle state.</p></div></div><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Course</th><th>Assigned</th><th>Due</th><th>Status</th><th>Lifecycle evidence</th></tr></thead><tbody>{assignments.map((assignment) => {
      const dueTime = dateOnlyTime(assignment.dueAt);
      const overdue = assignment.status === "ASSIGNED" && dueTime !== null ? dueTime < todayStart : false;
      const employee = employeeById.get(assignment.employeeId); const course = courseById.get(assignment.courseId);
      return <tr key={assignment.id}><td>{employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : assignment.employeeId}</td><td>{course ? `${course.code} · ${course.title}` : assignment.courseId}</td><td>{formatDateOnly(assignment.assignedAt)}</td><td>{formatDateOnly(assignment.dueAt)}</td><td>{overdue ? "OVERDUE" : assignment.status}</td><td>{assignment.cancelReason ?? "—"}</td></tr>;
    })}{!assignments.length && <tr><td colSpan={6}>No training assignments have been recorded.</td></tr>}</tbody></table></div></div>}

    {section === "assign" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Assign training</h3><p>Assign an active course to an eligible employee with governed dates.</p></div></div><form onSubmit={createAssignment} className="admin-form"><label>Employee<select name="employeeId" defaultValue="" required><option value="" disabled>Select employee</option>{employees.filter((employee) => employee.status !== "TERMINATED").map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.lastName}, {employee.firstName}</option>)}</select></label><label>Course<select name="courseId" defaultValue="" required><option value="" disabled>Select course</option>{courses.filter((course) => course.active).map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label><label>Assigned date<input name="assignedAt" type="date" required /></label><label>Due date<input name="dueAt" type="date" /></label><button type="submit" disabled={busy}>Assign training</button></form></div>}

    {section === "complete" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Record completion</h3><p>Record completion results with optional governed supporting evidence.</p></div></div><form onSubmit={complete} className="admin-form"><label>Assignment<select name="assignmentId" defaultValue="" required><option value="" disabled>Select active assignment</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{employeeById.get(assignment.employeeId)?.employeeNumber ?? assignment.employeeId} · {courseById.get(assignment.courseId)?.code ?? assignment.courseId}</option>)}</select></label><label>Completed at<input name="completedAt" type="datetime-local" required /></label><label>Result<input name="result" maxLength={500} /></label><GovernedEvidenceFilePicker domain="training" disabled={busy} /><button type="submit" disabled={busy}>Record completion</button></form></div>}

    {section === "lifecycle" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Lifecycle actions</h3><p>Cancel or reassign active training without rewriting assignment history.</p></div></div><form onSubmit={lifecycle} className="admin-form"><label>Assignment<select name="assignmentId" defaultValue="" required><option value="" disabled>Select active assignment</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{employeeById.get(assignment.employeeId)?.employeeNumber ?? assignment.employeeId} · {courseById.get(assignment.courseId)?.code ?? assignment.courseId}</option>)}</select></label><label>Action<select name="action" defaultValue="cancel"><option value="cancel">Cancel</option><option value="reassign">Reassign</option></select></label><label>Reason<input name="reason" maxLength={500} required /></label><label>New assigned date<input name="assignedAt" type="date" /></label><label>New due date<input name="dueAt" type="date" /></label><button type="submit" disabled={busy}>Apply lifecycle action</button></form></div>}

    {section === "courses" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Course configuration</h3><p>Create governed courses used for future training assignments.</p></div></div><form onSubmit={createCourse} className="admin-form"><label>Course code<input name="code" maxLength={80} required /></label><label>Course title<input name="title" maxLength={240} required /></label><label>Description<textarea name="description" maxLength={2000} /></label><button type="submit" disabled={busy}>Create course</button></form></div>}
  </section>;
}
