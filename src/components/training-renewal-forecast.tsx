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
  const visible = rows.filter((row) => filter === "ALL" || (filter === "DUE" && row.daysUntilDue <= 30) || (filter === "OVERDUE" && row.daysUntilDue < 0));
  return <section aria-label="Training renewal forecast">
    <h3>Training renewal forecast</h3>
    <p>Based on each employee’s latest official completion and the course renewal interval. This is planning information only; no automatic reassignment or expiration occurs.</p>
    {status === "loading" && <p>Loading renewal forecast…</p>}
    {status === "error" && <p role="alert">Renewal forecast could not be loaded.</p>}
    {status === "ready" && <>
      <p role="status"><strong>{overdue} past due</strong> · <strong>{upcoming} due within 30 days</strong> · {rows.length} renewal dates calculated (up to 1,000).</p>
      <label>Show renewals <select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="DUE">Past due and next 30 days</option><option value="OVERDUE">Past due only</option><option value="ALL">All forecast dates</option>
      </select></label>
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
