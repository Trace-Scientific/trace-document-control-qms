"use client";

import { useEffect, useState } from "react";
import { TrainingNotificationReview } from "./training-notification-review";
import { TrainingReminderSchedule } from "./training-reminder-schedule";

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
  const [preferences, setPreferences] = useState<{ enabled: boolean; remind30Days: boolean; remind7Days: boolean; remindOverdue: boolean } | null>(null);
  const [preferenceStatus, setPreferenceStatus] = useState("");
  const [processorPreview, setProcessorPreview] = useState<{ reminderType: string; eligible: number; alreadyRecorded: number }[] | null>(null);
  const [processorError, setProcessorError] = useState("");
  const [processorBusy, setProcessorBusy] = useState(false);
  const [stagingAvailable, setStagingAvailable] = useState(false);
  const [stagingStatus, setStagingStatus] = useState("");
  const [digest, setDigest] = useState<{ overdue: number; within7Days: number; within30Days: number } | null>(null);
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
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/training/renewal-notification-preview", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body: { data?: { overdue: number; within7Days: number; within30Days: number } } = await response.json();
        if (!controller.signal.aborted) setDigest(body.data ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/training/notification-preferences", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body: { data?: { enabled: boolean; remind30Days: boolean; remind7Days: boolean; remindOverdue: boolean } } = await response.json();
        if (!controller.signal.aborted) setPreferences(body.data ?? null);
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  async function savePreferences() {
    if (!preferences) return;
    setPreferenceStatus("Saving…");
    try {
      const response = await fetch("/api/training/notification-preferences", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      setPreferenceStatus(response.ok ? "Preferences saved. Automatic delivery remains inactive." : "Unable to save preferences.");
    } catch { setPreferenceStatus("Unable to save preferences."); }
  }
  async function previewProcessor() {
    setProcessorBusy(true);
    setProcessorError("");
    setStagingStatus("");
    setStagingAvailable(false);
    setProcessorPreview(null);
    try {
      const options = { credentials: "same-origin", cache: "no-store" } as const;
      const [response, readiness] = await Promise.all([
        fetch("/api/training/notification-processor-preview", options),
        fetch("/api/training/notification-schedule-readiness", options).catch(() => null),
      ]);
      if (!response.ok) throw new Error("Preview unavailable");
      const body: { data: { reminderType: string; eligible: number; alreadyRecorded: number }[] } = await response.json();
      setProcessorPreview(body.data);
      if (readiness?.ok) {
        const { data }: { data: { scheduleEnabled: boolean; preferencesEnabled: boolean } } = await readiness.json();
        setStagingAvailable(data.scheduleEnabled && data.preferencesEnabled);
      }
    } catch {
      setProcessorError("Unable to load notification processing status.");
    } finally {
      setProcessorBusy(false);
    }
  }
  async function stageReminders() {
    setProcessorBusy(true);
    setProcessorError("");
    setStagingStatus("");
    try {
      const response = await fetch("/api/training/notification-stage", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status === 409) {
        setStagingStatus("Staging is unavailable right now. Check the tenant schedule and try again when the next run is due.");
        return;
      }
      if (!response.ok) throw new Error("Staging unavailable");
      const { data }: { data: { stagedCount: number } } = await response.json();
      setProcessorPreview(null);
      setStagingAvailable(false);
      const reminderLabel = data.stagedCount === 1 ? "reminder" : "reminders";
      setStagingStatus(`${data.stagedCount} pending ${reminderLabel} staged. No messages sent.`);
    } catch {
      setProcessorError("Unable to stage training reminders. Run the preview again to check the ledger.");
      setProcessorPreview(null);
      setStagingAvailable(false);
    } finally {
      setProcessorBusy(false);
    }
  }
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
    void navigator.clipboard.writeText(lines.join("\n"));
  }
  return <section aria-label="Training renewal forecast">
    <h3>Training renewal forecast</h3>
    <p>Based on each employee’s latest official completion and the course renewal interval. This is planning information only; no automatic reassignment or expiration occurs.</p>
    {preferences && <fieldset><legend>Training notification preferences (manager only)</legend>
      <p>Configure future delivery. Saving these settings does not activate email or scheduled notifications.</p>
      {(["enabled", "remind30Days", "remind7Days", "remindOverdue"] as const).map((key) => <label key={key} style={{ display: "block" }}><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} /> {key === "enabled" ? "Enable notifications when delivery is released" : key === "remind30Days" ? "30-day reminders" : key === "remind7Days" ? "7-day reminders" : "Overdue reminders"}</label>)}
      <button type="button" onClick={() => void savePreferences()}>Save notification preferences</button>
      {preferenceStatus && <p role="status">{preferenceStatus}</p>}
    </fieldset>}
    {preferences && <TrainingReminderSchedule disabled={processorBusy} onSaved={() => {
      setProcessorPreview(null);
      setStagingAvailable(false);
      setStagingStatus("");
    }} />}
    {preferences && <TrainingNotificationReview />}
    {preferences && <div><button type="button" disabled={processorBusy} onClick={() => void previewProcessor()}>Preview notification processing (dry run)</button>
      {processorError && <p role="alert">{processorError}</p>}
      {stagingStatus && <p role="status">{stagingStatus}</p>}
      {processorPreview && <p role="status">Dry run only — {processorPreview.reduce((sum, row) => sum + row.eligible, 0)} eligible reminders; {processorPreview.reduce((sum, row) => sum + row.alreadyRecorded, 0)} already recorded. No messages sent or records created.</p>}
      {stagingAvailable && processorPreview?.some((row) => row.eligible > 0) && (
        <button type="button" disabled={processorBusy} onClick={() => void stageReminders()}>
          Stage one batch of pending reminders
        </button>
      )}
    </div>}
    {digest && <p role="status">Notification preview (not sent): {digest.overdue} overdue, {digest.within7Days} due within 7 days, {digest.within30Days} due within 30 days. Automatic delivery is disabled.</p>}
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
