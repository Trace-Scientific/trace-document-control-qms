"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: "ACTIVE" | "INACTIVE" | "TERMINATED"; hireDate: string | null; terminationDate: string | null };
type Job = { id: string; code: string; title: string; summary: string | null; active: boolean };
type Assignment = { id: string; employeeId: string; jobDescriptionId: string; siteId: string | null; departmentId: string | null; isPrimary: boolean; assignedAt: string; endedAt: string | null };
type PersonnelSection = "library" | "employee" | "assignments" | "jobs";

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return datePart;
  const [, year, month, day] = match;
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function PersonnelManagementWorkspace({ canManage }: { canManage: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<PersonnelSection>("library");

  async function load() {
    const [employeeResponse, jobResponse, assignmentResponse] = await Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/personnel/jobs", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/personnel/assignments", { credentials: "same-origin", cache: "no-store" }),
    ]);
    if (employeeResponse.ok) setEmployees((await employeeResponse.json()).data ?? []);
    if (jobResponse.ok) setJobs((await jobResponse.json()).data ?? []);
    if (assignmentResponse.ok) {
      setAssignments((await assignmentResponse.json()).data ?? []);
    } else {
      const body = await assignmentResponse.json().catch(() => null);
      setNotice(body?.error || "Personnel assignments could not be loaded.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/personnel/jobs", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/personnel/assignments", { credentials: "same-origin", cache: "no-store" }),
    ]).then(async ([employeeResponse, jobResponse, assignmentResponse]) => {
      if (cancelled) return;
      if (employeeResponse.ok) { const body = await employeeResponse.json(); if (!cancelled) setEmployees(body.data ?? []); }
      if (jobResponse.ok) { const body = await jobResponse.json(); if (!cancelled) setJobs(body.data ?? []); }
      if (assignmentResponse.ok) {
        const body = await assignmentResponse.json();
        if (!cancelled) setAssignments(body.data ?? []);
      } else {
        const body = await assignmentResponse.json().catch(() => null);
        if (!cancelled) setNotice(body?.error || "Personnel assignments could not be loaded.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const visibleEmployees = useMemo(() => { const normalized = query.trim().toLowerCase(); if (!normalized) return employees; return employees.filter((employee) => [employee.employeeNumber, employee.firstName, employee.lastName, employee.status].some((value) => value.toLowerCase().includes(normalized))); }, [employees, query]);

  async function createEmployee(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNotice(""); const hireDate = String(form.get("hireDate")); const response = await fetch("/api/personnel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeNumber: String(form.get("employeeNumber")), firstName: String(form.get("firstName")), lastName: String(form.get("lastName")), hireDate: hireDate || null }) }); const body = await response.json().catch(() => null); setBusy(false); if (!response.ok) return setNotice(body?.error || "Employee could not be created."); event.currentTarget.reset(); setNotice(`Employee ${body.data.employeeNumber} created with audit evidence.`); await load(); }
  async function createJob(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNotice(""); const response = await fetch("/api/personnel/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: String(form.get("code")), title: String(form.get("title")), summary: String(form.get("summary")) || null }) }); const body = await response.json().catch(() => null); setBusy(false); if (!response.ok) return setNotice(body?.error || "Job description could not be created."); event.currentTarget.reset(); setNotice(`Job description ${body.data.code} created with audit evidence.`); await load(); }
  async function createAssignment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNotice(""); const response = await fetch("/api/personnel/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId: String(form.get("employeeId")), jobDescriptionId: String(form.get("jobDescriptionId")), assignedAt: String(form.get("assignedAt")), isPrimary: form.get("isPrimary") === "on" }) }); const body = await response.json().catch(() => null); setBusy(false); if (!response.ok) return setNotice(body?.error || "Job assignment could not be created."); event.currentTarget.reset(); setNotice("Job assignment created with audit evidence."); await load(); }
  async function changeStatus(employee: Employee, targetStatus: "ACTIVE" | "INACTIVE" | "TERMINATED") { const reason = window.prompt(`Change ${employee.employeeNumber} from ${employee.status} to ${targetStatus}. Enter the controlled reason:`); if (!reason?.trim()) return; let effectiveDate: string | null = null; if (targetStatus === "TERMINATED") { effectiveDate = window.prompt("Enter the termination date (YYYY-MM-DD):"); if (!effectiveDate?.trim()) return; } setBusy(true); setNotice(""); const response = await fetch("/api/personnel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "SET_STATUS", employeeId: employee.id, targetStatus, effectiveDate, reason }) }); const body = await response.json().catch(() => null); setBusy(false); if (!response.ok) return setNotice(body?.error || "Personnel status could not be changed."); setNotice(`Employee ${employee.employeeNumber} changed to ${body.data.status} with audit evidence.`); await load(); }
  async function endAssignment(assignment: Assignment) { const endedAt = window.prompt("Enter the assignment end date (YYYY-MM-DD):"); if (!endedAt?.trim()) return; const reason = window.prompt("Enter the controlled assignment end reason:"); if (!reason?.trim()) return; setBusy(true); setNotice(""); const response = await fetch("/api/personnel/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "END", assignmentId: assignment.id, endedAt, reason }) }); const body = await response.json().catch(() => null); setBusy(false); if (!response.ok) return setNotice(body?.error || "Job assignment could not be ended."); setNotice("Job assignment ended with audit evidence."); await load(); }

  const sections = [
    { id: "library" as const, label: "Personnel library", description: "Search, browse, and manage governed personnel records." },
    ...(canManage ? [
      { id: "employee" as const, label: "Add employee", description: "Create a governed employee identity separate from login accounts." },
      { id: "assignments" as const, label: "Job assignments", description: "Assign approved job descriptions and preserve assignment history." },
      { id: "jobs" as const, label: "Job descriptions", description: "Configure governed job codes, titles, and summaries." },
    ] : []),
  ];

  return <section className="workspace-section" aria-labelledby="personnel-management-heading">
    <div className="section-heading"><div><p className="eyebrow">Personnel</p><h2 id="personnel-management-heading">Personnel management</h2><p>Open one governed personnel function at a time while preserving employee and assignment history.</p></div></div>
    <nav className="module-subnav" aria-label="Personnel management sections">{sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); if (item.id === "library") void load(); }}><strong>{item.label}</strong><span>{item.description}</span></button>)}</nav>
    {notice && <p role="status">{notice}</p>}

    {section === "library" && <div className="module-section-stack"><div className="section-heading"><div><h3>Personnel library</h3><p>Browse governed employee identities, current status, and active assignments.</p></div></div><label>Search personnel<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee number, name, or status" /></label><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Name</th><th>Status</th><th>Hire date</th><th>Active assignments</th><th>Actions</th></tr></thead><tbody>
      {visibleEmployees.map((employee) => { const active = assignments.filter((assignment) => assignment.employeeId === employee.id && !assignment.endedAt); return <tr key={employee.id}><td>{employee.employeeNumber}</td><td>{employee.lastName}, {employee.firstName}</td><td>{employee.status}{employee.terminationDate ? ` · ${formatDateOnly(employee.terminationDate)}` : ""}</td><td>{formatDateOnly(employee.hireDate)}</td><td>{active.length ? active.map((assignment) => { const job = jobById.get(assignment.jobDescriptionId); return <span key={assignment.id}>{job?.code ?? assignment.jobDescriptionId}{assignment.isPrimary ? " (Primary)" : ""}{canManage && <button type="button" disabled={busy} onClick={() => void endAssignment(assignment)}>End</button>}</span>; }) : "—"}</td><td>{canManage && employee.status !== "TERMINATED" ? <>{employee.status !== "ACTIVE" && <button type="button" disabled={busy} onClick={() => void changeStatus(employee, "ACTIVE")}>Activate</button>}{employee.status !== "INACTIVE" && <button type="button" disabled={busy} onClick={() => void changeStatus(employee, "INACTIVE")}>Inactivate</button>}<button type="button" disabled={busy} onClick={() => void changeStatus(employee, "TERMINATED")}>Terminate</button></> : "—"}</td></tr>; })}
      {!visibleEmployees.length && <tr><td colSpan={6}>{employees.length ? "No personnel match the current search." : "No governed personnel records have been created."}</td></tr>}
    </tbody></table></div></div>}

    {section === "employee" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Add employee</h3><p>Create a governed employee identity independently from application login accounts.</p></div></div><form onSubmit={createEmployee} className="admin-form"><label>Employee number<input name="employeeNumber" maxLength={80} required /></label><label>First name<input name="firstName" maxLength={120} required /></label><label>Last name<input name="lastName" maxLength={120} required /></label><label>Hire date<input name="hireDate" type="date" /></label><button type="submit" disabled={busy}>Create employee</button></form></div>}

    {section === "assignments" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Job assignments</h3><p>Assign an active job description to an active employee while retaining historical assignment evidence.</p></div></div><form onSubmit={createAssignment} className="admin-form"><label>Employee<select name="employeeId" defaultValue="" required><option value="" disabled>Select employee</option>{employees.filter((employee) => employee.status === "ACTIVE").map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.lastName}, {employee.firstName}</option>)}</select></label><label>Job description<select name="jobDescriptionId" defaultValue="" required><option value="" disabled>Select job</option>{jobs.filter((job) => job.active).map((job) => <option key={job.id} value={job.id}>{job.code} · {job.title}</option>)}</select></label><label>Assigned date<input name="assignedAt" type="date" required /></label><label><input name="isPrimary" type="checkbox" /> Primary assignment</label><button type="submit" disabled={busy || !employees.some((employee) => employee.status === "ACTIVE") || !jobs.some((job) => job.active)}>Create job assignment</button></form></div>}

    {section === "jobs" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Job descriptions</h3><p>Configure governed job descriptions used by personnel assignments.</p></div></div><form onSubmit={createJob} className="admin-form"><label>Job code<input name="code" maxLength={40} required /></label><label>Job title<input name="title" maxLength={200} required /></label><label>Summary<textarea name="summary" maxLength={2000} /></label><button type="submit" disabled={busy}>Create job description</button></form></div>}
  </section>;
}
