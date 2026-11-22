"use client";

import { useEffect, useState } from "react";

type Renewal = {
  employeeId: string; employeeNumber: string; firstName: string; lastName: string;
  courseId: string; courseCode: string; courseTitle: string; completionId: string;
  completedAt: string; intervalMonths: number; renewalDueAt: string; daysUntilDue: number;
};

export function TrainingRenewalForecast() {
  const [rows, setRows] = useState<Renewal[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState("DUE");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/training/renewal-forecast", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Forecast unavailable");
        const body: { data?: Renewal[] } = await response.json();
        if (!controller.signal.aborted) { setRows(body.data ?? []); setStatus("ready"); }
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, []);
  const overdue = rows.filter((row) => row.daysUntilDue < 0).length;
  const upcoming = rows.filter((row) => row.daysUntilDue >= 0 && row.daysUntilDue <= 30).length;
  const urgent = rows.filter((row) => row.daysUntilDue >= 0 && row.daysUntilDue <= 7).length;
  const visible = rows.filter((row) => {
    const matchesPeriod = filter === "ALL" || (filter === "DUE" && row.daysUntilDue <= 30) || (filter === "OVERDUE" && row.daysUntilDue < 0) || (filter === "URGENT" && row.daysUntilDue >= 0 && row.daysUntilDue <= 7);
    const matchesSearch = `${row.employeeNumber} ${row.firstName} ${row.lastName} ${row.courseCode} ${row.courseTitle}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesPeriod && matchesSearch;
  });
  function copyReminderSummary() {
    const due = visible.filter((row) => row.daysUntilDue <= 30);
    const lines = ["Trace QMS — training renewal follow-up (manager review required)", ...due.map((row) => `${row.employeeNumber} — ${row.lastName}, ${row.firstName} | ${row.courseCode} | Due ${row.renewalDueAt.slice(0, 10)} | ${row.daysUntilDue < 0 ? "Overdue" : `${row.daysUntilDue} day(s) remaining`}`)];
    void navigator.clipboard.writeText(lines.join("\\n"));
  }
  return <section aria-label="Training renewal forecast">
    <h3>Training renewal forecast</h3>
    <p>Based on each employee’s latest official completion and the course renewal interval. This is planning information only; no automatic reassignment or expiration occurs.</p>
    {status === "loading" && <p>Loading renewal forecast…</p>}
    {status === "error" && <p role="alert">Renewal forecast could not be loaded.</p>}
    {status === "ready" && <>
      <p role="status"><strong>{overdue} past due</strong> · <strong>{urgent} due within 7 days</strong> · <strong>{upcoming} due within 30 days</strong> · {rows.length} renewal dates calculated (up to 1,000).</p>
      <label>Show renewals <select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="DUE">Past due and next 30 days</option><option value="URGENT">Due within 7 days</option><option value="OVERDUE">Past due only</option><option value="ALL">All forecast dates</option>
      </select></label>
      <label>Find employee or course <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, employee number, course" /></label>
      <button type="button" onClick={copyReminderSummary} disabled={!visible.some((row) => row.daysUntilDue <= 30)}>Copy manager follow-up list</button>
      <p>Reminders are shown inside this manager view only. Copying a list does not send messages, enroll employees, or change records.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Employee</th><th>Course</th><th>Last completed</th><th>Interval</th><th>Next renewal</th><th>Forecast status</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.completionId}>
          <td>{row.employeeNumber} · {row.lastName}, {row.firstName}</td>
          <td>{row.courseCode} · {row.courseTitle}</td>
          <td>{row.completedAt.slice(0, 10)}</td><td>{row.intervalMonths} months</td>
          <td>{row.renewalDueAt.slice(0, 10)}</td>
          <td>{row.daysUntilDue < 0 ? "Past due" : row.daysUntilDue <= 30 ? "Due within 30 days" : "Scheduled"}</td>
        </tr>)}</tbody>
      </table></div>
      {visible.length === 0 && <p>No renewal dates match this filter.</p>}
    </>}
  </section>;
}
